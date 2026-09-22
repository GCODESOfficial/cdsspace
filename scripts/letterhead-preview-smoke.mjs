import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import esbuild from "esbuild";
import puppeteer from "puppeteer";

const require = createRequire(import.meta.url);
const root = process.cwd();
const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const workerSource = await readFile(workerPath, "utf8");
const workerUrl = `data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`;

const bundled = await esbuild.build({
  stdin: {
    contents: `
      import { buildLetterheadPdf, prepareLetterheadPdf, prepareLetterheadPdfExport } from "@/lib/letterhead-pdf";
      import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

      window.runLetterheadPreviewSmoke = async (workerSrc) => {
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        const paragraph = "This paragraph verifies that letterhead text wraps and continues at the exact generated PDF page boundary. ".repeat(8);
        const bodyHtml = Array.from({ length: 28 }, (_, index) => "<p>Section " + (index + 1) + ". " + paragraph + "</p>").join("");

        const render = async (paperSize) => {
          const doc = await buildLetterheadPdf({
            title: "Preview parity smoke",
            bodyHtml,
            paperSize,
            firstPageUrl: null,
            secondPageUrl: null,
            hasSecondPage: true,
            signatureUrl: null,
            signatureX: 20,
            signatureY: 70,
            signatureWidth: 24,
            signaturePage: "last",
          }, { includeSignature: false });
          const task = pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")) });
          const pdf = await task.promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const result = { pages: pdf.numPages, width: viewport.width, height: viewport.height, painted: canvas.width > 0 && canvas.height > 0 };
          await task.destroy();
          return result;
        };

        const artworkCanvas = document.createElement("canvas");
        artworkCanvas.width = 1100;
        artworkCanvas.height = 1556;
        const artworkContext = artworkCanvas.getContext("2d", { alpha: false });
        const pixels = artworkContext.createImageData(artworkCanvas.width, artworkCanvas.height);
        let seed = 1776;
        for (let index = 0; index < pixels.data.length; index += 4) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          pixels.data[index] = seed & 255;
          pixels.data[index + 1] = (seed >>> 8) & 255;
          pixels.data[index + 2] = (seed >>> 16) & 255;
          pixels.data[index + 3] = 255;
        }
        artworkContext.putImageData(pixels, 0, 0);
        const compressionOptions = {
          title: "Compression smoke",
          bodyHtml: "<h1>Exact page test</h1><p>The optimized download must keep the selected paper geometry.</p>",
          paperSize: "a4",
          firstPageUrl: artworkCanvas.toDataURL("image/png"),
          secondPageUrl: null,
          hasSecondPage: false,
          signatureUrl: null,
          signatureX: 20,
          signatureY: 70,
          signatureWidth: 24,
          signaturePage: "last",
        };
        const original = await prepareLetterheadPdf(compressionOptions);
        const compressed = await prepareLetterheadPdfExport(compressionOptions, "compressed", original.slice(0));
        const lite = await prepareLetterheadPdfExport(compressionOptions, "lite", original.slice(0));

        return { a4: await render("a4"), legal: await render("legal"), originalBytes: original.byteLength, compressedBytes: compressed.data.byteLength, liteBytes: lite.data.byteLength };
      };
    `,
    resolveDir: root,
    sourcefile: "letterhead-preview-smoke-entry.ts",
    loader: "ts",
  },
  alias: { "@": path.join(root, "src") },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  write: false,
});

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CMEET_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: bundled.outputFiles[0].text, type: "module" });
  const result = await page.evaluate((src) => window.runLetterheadPreviewSmoke(src), workerUrl);

  assert.ok(result.a4.pages > 1, "A4 content did not paginate");
  assert.ok(result.legal.pages > 1, "Legal content did not paginate");
  assert.ok(result.a4.painted && result.legal.painted, "A generated PDF page did not paint to the preview canvas");
  assert.ok(result.legal.height > result.a4.height, "Legal preview did not retain its taller paper geometry");
  assert.ok(result.legal.pages <= result.a4.pages, "Legal paper unexpectedly held less content than A4");
  assert.ok(result.compressedBytes <= Math.floor(result.originalBytes * 0.5), "Compressed PDF was not at least 50% smaller than the original");
  assert.ok(result.liteBytes <= Math.floor(result.originalBytes * 0.75), "Lite PDF was not at least 25% smaller than the original");
  console.log(`Letterhead preview smoke passed: A4=${result.a4.pages} pages, Legal=${result.legal.pages} pages, original=${result.originalBytes} bytes, compressed=${result.compressedBytes} bytes, lite=${result.liteBytes} bytes.`);
} finally {
  await browser.close();
}
