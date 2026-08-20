import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const TARGET_DPI = 144;
const JPEG_QUALITY = 72;
const MAX_OUTPUT_GROWTH = 1.08;

type OptimizerModule = typeof import("@pdfmergy/pdf-compress-wasm");

export type IntelligencePdfOptimization = {
  buffer: Buffer;
  originalBytes: number;
  storedBytes: number;
  savedBytes: number;
  savingsPercent: number;
  optimized: boolean;
  linearized: boolean;
  fallbackReason?: string;
  stats?: {
    pages: number;
    imagesProcessed: number;
    fontsSubsetted: number;
    processingMs: number;
  };
};

let optimizerModulePromise: Promise<OptimizerModule> | null = null;

async function getOptimizerModule() {
  if (!optimizerModulePromise) {
    optimizerModulePromise = (async () => {
      const optimizer = await import("@pdfmergy/pdf-compress-wasm");
      // Resolve from the package's JS entry instead of importing the .wasm
      // subpath, which would make Next/Turbopack try to compile the binary.
      const packageEntry = require.resolve("@pdfmergy/pdf-compress-wasm/dist/index.js");
      const wasmPath = join(dirname(packageEntry), "pdf-compress.wasm");
      const wasmBinary = await readFile(wasmPath);
      await optimizer.init({
        wasmBinary: new Uint8Array(wasmBinary.buffer, wasmBinary.byteOffset, wasmBinary.byteLength),
      });
      return optimizer;
    })();
    optimizerModulePromise.catch(() => {
      optimizerModulePromise = null;
    });
  }
  return optimizerModulePromise;
}

function originalResult(input: Buffer, fallbackReason: string): IntelligencePdfOptimization {
  return {
    buffer: input,
    originalBytes: input.length,
    storedBytes: input.length,
    savedBytes: 0,
    savingsPercent: 0,
    optimized: false,
    linearized: false,
    fallbackReason,
  };
}

/**
 * Recompress image-heavy PDFs and linearize their object layout for byte-range
 * delivery. The original bytes remain a safe fallback so a missing/unsupported
 * WASM runtime never prevents an otherwise valid publication from uploading.
 */
export async function optimizeIntelligencePdf(input: Buffer): Promise<IntelligencePdfOptimization> {
  if (!input.length) return originalResult(input, "empty-input");

  try {
    const optimizer = await getOptimizerModule();
    const startedAt = Date.now();
    const result = await optimizer.compress(Uint8Array.from(input), {
      dpi: TARGET_DPI,
      quality: JPEG_QUALITY,
      level: 9,
      linearize: true,
      objectStreams: true,
      recompress: true,
      subsetFonts: true,
    });
    const output = Buffer.from(result.data);

    if (!output.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return originalResult(input, "optimizer-returned-invalid-header");
    }
    if (output.length > Math.ceil(input.length * MAX_OUTPUT_GROWTH)) {
      return originalResult(input, "optimized-file-was-materially-larger");
    }

    const savedBytes = input.length - output.length;
    return {
      buffer: output,
      originalBytes: input.length,
      storedBytes: output.length,
      savedBytes,
      savingsPercent: Number(((savedBytes / input.length) * 100).toFixed(1)),
      optimized: true,
      linearized: true,
      stats: result.stats ? {
        pages: result.stats.pages,
        imagesProcessed: result.stats.imagesProcessed,
        fontsSubsetted: result.stats.fontsSubsetted,
        processingMs: Date.now() - startedAt,
      } : undefined,
    };
  } catch (error) {
    console.warn("[intelligence/pdf-optimizer] Using the original PDF after optimization failed:", error instanceof Error ? error.message : "Unknown optimizer error");
    return originalResult(input, "optimizer-failed");
  }
}
