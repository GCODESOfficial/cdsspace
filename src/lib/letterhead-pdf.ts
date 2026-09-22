/* eslint-disable @typescript-eslint/no-explicit-any */

import jsPDF from "jspdf";
import { parseRichHtmlToBlocks } from "@/lib/cdocs-html";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";

export type LetterheadPdfOptions = {
  title: string;
  bodyHtml: string;
  paperSize: "a4" | "legal";
  firstPageUrl?: string | null;
  secondPageUrl?: string | null;
  hasSecondPage: boolean;
  signatureUrl?: string | null;
  signatureX: number;
  signatureY: number;
  signatureWidth: number;
  signaturePage: "first" | "last";
};

export type LetterheadExportSize = "original" | "compressed" | "lite";

type ImageAsset = { dataUrl: string; width: number; height: number };

// Rebuilding an exact preview while somebody types should not download and
// decode the same private letterhead artwork on every keystroke. Asset URLs are
// versioned when a file is replaced, so this small session cache remains fresh.
const imageAssetCache = new Map<string, Promise<ImageAsset | null>>();

async function loadImage(url: string): Promise<ImageAsset | null> {
  if (!url || typeof window === "undefined") return null;
  const cached = imageAssetCache.get(url);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return null;
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
        image.onerror = reject;
        image.src = dataUrl;
      });
      return { dataUrl, ...dimensions };
    } catch {
      return null;
    }
  })();
  imageAssetCache.set(url, pending);
  const asset = await pending;
  if (!asset) imageAssetCache.delete(url);
  return asset;
}

function plainText(spans: Array<{ text: string }>) {
  return spans.map((span) => span.text).join("").replace(/\u00a0/g, " ");
}

export async function buildLetterheadPdf(
  options: LetterheadPdfOptions,
  { includeSignature = true }: { includeSignature?: boolean } = {},
) {
  const format: [number, number] = options.paperSize === "legal" ? [215.9, 355.6] : [210, 297];
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format, compress: true, putOnlyUsedFonts: true });
  installBrandFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const top = 38;
  const bottom = 22;
  const maxWidth = pageWidth - (marginX * 2);
  const lineHeight = 5.6;
  const [firstBackground, secondBackground, signature] = await Promise.all([
    options.firstPageUrl ? loadImage(options.firstPageUrl) : Promise.resolve(null),
    options.hasSecondPage && options.secondPageUrl ? loadImage(options.secondPageUrl) : Promise.resolve(null),
    includeSignature && options.signatureUrl ? loadImage(options.signatureUrl) : Promise.resolve(null),
  ]);

  function drawBackground(pageNumber: number) {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    const background = pageNumber === 1 ? firstBackground : (secondBackground || firstBackground);
    if (background) doc.addImage(background.dataUrl, "PNG", 0, 0, pageWidth, pageHeight);
  }

  let pageNumber = 1;
  let y = top;
  drawBackground(pageNumber);

  function addPage() {
    doc.addPage(format, "portrait");
    pageNumber += 1;
    y = top;
    drawBackground(pageNumber);
  }

  function ensureSpace(height: number) {
    if (y + height > pageHeight - bottom) addPage();
  }

  function drawText(text: string, size = 10, style: "normal" | "bold" | "italic" = "normal", indent = 0, prefix = "") {
    doc.setFontSize(size);
    const fontName = (doc as any).getFont?.()?.fontName || "helvetica";
    doc.setFont(fontName, style);
    doc.setTextColor(25, 32, 48);
    const usable = maxWidth - indent;
    const lines = doc.splitTextToSize(`${prefix}${text}`, usable) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight + Math.max(0, size - 10) * 0.25);
      doc.text(line, marginX + indent, y);
      y += lineHeight + Math.max(0, size - 10) * 0.25;
    }
    doc.setFont(fontName, "normal");
  }

  const blocks = parseRichHtmlToBlocks(options.bodyHtml || "");
  for (const block of blocks) {
    if (block.kind === "blank") { y += lineHeight * 0.65; continue; }
    if (block.kind === "hr") {
      ensureSpace(7);
      y += 2;
      doc.setDrawColor(200, 205, 215);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 4;
      continue;
    }
    if (block.kind === "h1") { y += 2; drawText(plainText(block.spans), 16, "bold"); y += 2; continue; }
    if (block.kind === "h2") { y += 1; drawText(plainText(block.spans), 13, "bold"); y += 1; continue; }
    if (block.kind === "bullet") { drawText(plainText(block.spans), 10, "normal", 4, "•  "); continue; }
    if (block.kind === "ordered") { drawText(plainText(block.spans), 10, "normal", 4, `${block.index}.  `); continue; }
    if (block.kind === "image") {
      const asset = await loadImage(block.src);
      if (!asset) continue;
      const width = Math.min(maxWidth, Math.max(20, (block.width || 500) * 0.16));
      const height = width * (asset.height / asset.width);
      ensureSpace(height + 4);
      const x = block.align === "right" ? pageWidth - marginX - width : block.align === "center" ? (pageWidth - width) / 2 : marginX;
      doc.addImage(asset.dataUrl, "PNG", x, y, width, height);
      y += height + 4;
      continue;
    }
    drawText(plainText(block.spans), 10, "normal");
  }

  if (signature && includeSignature) {
    const targetPage = options.signaturePage === "first" ? 1 : pageNumber;
    doc.setPage(targetPage);
    const width = pageWidth * Math.min(80, Math.max(5, options.signatureWidth)) / 100;
    const height = width * signature.height / signature.width;
    const x = Math.min(pageWidth - width, Math.max(0, pageWidth * options.signatureX / 100));
    const signatureY = Math.min(pageHeight - height, Math.max(0, pageHeight * options.signatureY / 100));
    doc.addImage(signature.dataUrl, "PNG", x, signatureY, width, height);
  }

  doc.setProperties({
    title: options.title || "Official letterhead",
    subject: "Corporate letterhead document",
    author: "CDS Space",
    creator: "CDS Space cDocs",
  });
  return doc;
}

export async function prepareLetterheadPdf(options: LetterheadPdfOptions) {
  const doc = await buildLetterheadPdf(options);
  return doc.output("arraybuffer");
}

function safeFileName(title: string) {
  return (title || "official-letterhead").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "official-letterhead";
}

function downloadPdf(bytes: ArrayBuffer, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function optimizedLetterheadPdf(
  source: ArrayBuffer,
  paperSize: "a4" | "legal",
  exportSize: Exclude<LetterheadExportSize, "original">,
) {
  // Export sizes are relative to the PDF we actually generated, not arbitrary
  // MB ceilings. "Compressed" is at least 50% smaller; "lite" is at least
  // 25% smaller, exactly matching the choices shown before download.
  const targetBytes = Math.max(1, Math.floor(source.byteLength * (exportSize === "compressed" ? 0.5 : 0.75)));

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(source.slice(0)) });
  const canvases: HTMLCanvasElement[] = [];
  try {
    const sourcePdf = await loadingTask.promise;
    const renderScale = exportSize === "compressed" ? 1.35 : 1.7;
    for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
      const page = await sourcePdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("This browser cannot prepare the selected PDF size.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      page.cleanup();
      canvases.push(canvas);
    }

    const format: [number, number] = paperSize === "legal" ? [215.9, 355.6] : [210, 297];
    const pageWidth = format[0];
    const pageHeight = format[1];
    const initialQuality = exportSize === "compressed" ? 0.72 : 0.86;
    const initialScale = exportSize === "compressed" ? 0.82 : 1;
    let best = source;

    // Reuse the already-rendered pages while progressively reducing JPEG
    // quality and dimensions until the requested byte ceiling is met.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scale = Math.max(0.12, initialScale * Math.pow(0.78, attempt));
      const quality = Math.max(0.16, initialQuality * Math.pow(0.82, attempt));
      const output = new jsPDF({ orientation: "portrait", unit: "mm", format, compress: true });

      for (let index = 0; index < canvases.length; index += 1) {
        if (index > 0) output.addPage(format, "portrait");
        const sourceCanvas = canvases[index];
        let encodedCanvas = sourceCanvas;
        if (scale < 0.995) {
          encodedCanvas = document.createElement("canvas");
          encodedCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
          encodedCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
          const context = encodedCanvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("This browser cannot compress the selected PDF.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, encodedCanvas.width, encodedCanvas.height);
          context.drawImage(sourceCanvas, 0, 0, encodedCanvas.width, encodedCanvas.height);
        }
        output.addImage(encodedCanvas.toDataURL("image/jpeg", quality), "JPEG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
        if (encodedCanvas !== sourceCanvas) {
          encodedCanvas.width = 1;
          encodedCanvas.height = 1;
        }
      }

      const candidate = output.output("arraybuffer");
      if (candidate.byteLength < best.byteLength) best = candidate;
      if (candidate.byteLength <= targetBytes) return candidate;
    }
    return best;
  } finally {
    canvases.forEach((canvas) => { canvas.width = 1; canvas.height = 1; });
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function exportLetterheadToPdf(
  options: LetterheadPdfOptions,
  exportSize: LetterheadExportSize = "original",
  preparedSource?: ArrayBuffer,
) {
  const result = await prepareLetterheadPdfExport(options, exportSize, preparedSource);
  const suffix = exportSize === "original" ? "" : `-${exportSize}`;
  downloadPdf(result.data, `${safeFileName(options.title)}${suffix}.pdf`);
  return { bytes: result.data.byteLength, exportSize };
}

export async function prepareLetterheadPdfExport(
  options: LetterheadPdfOptions,
  exportSize: LetterheadExportSize = "original",
  preparedSource?: ArrayBuffer,
) {
  const source = preparedSource || await prepareLetterheadPdf(options);
  const data = exportSize === "original"
    ? source
    : await optimizedLetterheadPdf(source, options.paperSize, exportSize);
  return { data, exportSize };
}
