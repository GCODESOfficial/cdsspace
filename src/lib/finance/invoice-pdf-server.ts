import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { LoadedImage } from "@/lib/invoice-pdf";

/**
 * Server image loader for buildInvoicePdf: site images ("/CDS_Seal.png") are
 * read from public/, others fetched. Everything is drawn onto a canvas and
 * handed to jsPDF as PNG (SVGs rasterised at targetWidth), the same shape the
 * browser loader returns.
 */
export async function loadServerPdfImage(url: string, targetWidth = 256): Promise<LoadedImage | null> {
  try {
    let bytes: Buffer;
    if (/^https?:\/\//i.test(url)) {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return null;
      bytes = Buffer.from(await response.arrayBuffer());
    } else {
      const relative = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\/+/, "");
      const publicDir = path.join(process.cwd(), "public");
      const file = path.resolve(publicDir, relative);
      if (!file.startsWith(publicDir + path.sep)) return null; // stay inside public/
      bytes = await readFile(file);
    }
    const image = await loadImage(bytes);
    const isSvg = url.toLowerCase().split(/[?#]/)[0].endsWith(".svg");
    const width = isSvg ? targetWidth : image.width;
    const height = isSvg ? Math.round(targetWidth * (image.height / image.width || 1)) : image.height;
    const canvas = createCanvas(width, height);
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    return { data: canvas.toDataURL("image/png"), format: "PNG", width, height };
  } catch {
    return null;
  }
}
