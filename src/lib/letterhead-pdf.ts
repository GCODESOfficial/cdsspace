/* eslint-disable @typescript-eslint/no-explicit-any */

import jsPDF from "jspdf";
import {
  hexToRgb,
  parseRichHtmlToBlocks,
  type RichAlignment,
  type RichSpan,
} from "@/lib/cdocs-html";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";

export type LetterheadPdfOptions = {
  title: string;
  bodyHtml: string;
  paperSize: "a4" | "legal";
  /** Body leading multiplier: 1 is single spacing, 1.5 one-and-a-half, 2 double. */
  lineSpacing?: number;
  bottomMargin: "wide" | "small";
  firstPageUrl?: string | null;
  secondPageUrl?: string | null;
  hasSecondPage: boolean;
  signatureUrl?: string | null;
  signatureX: number;
  signatureY: number;
  signatureWidth: number;
  signaturePage: "first" | "last";
  stampUrl?: string | null;
  stampX: number;
  stampY: number;
  stampWidth: number;
  stampPage: "first" | "last";
  signatures?: Array<{
    signatureUrl?: string | null;
    signatureX: number;
    signatureY: number;
    signatureWidth: number;
    signaturePage: "first" | "last";
    status: string;
  }>;
};

export type LetterheadExportSize = "original" | "compressed" | "lite";

/**
 * Keep document text above the branded footer artwork on every letterhead.
 * Uploaded stationery is fitted to the full paper, so Legal paper needs a
 * proportionally taller protected area than A4. The 48 mm floor protects A4
 * continuation designs whose decorative footer extends beyond the final 15%.
 */
export const LETTERHEAD_CONTENT_BOTTOM_SAFE_AREA_RATIO = 0.16;
export const LETTERHEAD_CONTENT_BOTTOM_MIN_MM = 48;
export const LETTERHEAD_CONTENT_BOTTOM_SMALL_AREA_RATIO = 0.08;
export const LETTERHEAD_CONTENT_BOTTOM_SMALL_MIN_MM = 24;

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

export async function buildLetterheadPdf(
  options: LetterheadPdfOptions,
  { includeSignature = true, includeStamp = includeSignature }: { includeSignature?: boolean; includeStamp?: boolean } = {},
) {
  const format: [number, number] = options.paperSize === "legal" ? [215.9, 355.6] : [210, 297];
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format, compress: true, putOnlyUsedFonts: true });
  installBrandFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const top = 38;
  const bottom = options.bottomMargin === "small"
    ? Math.max(LETTERHEAD_CONTENT_BOTTOM_SMALL_MIN_MM, pageHeight * LETTERHEAD_CONTENT_BOTTOM_SMALL_AREA_RATIO)
    : Math.max(LETTERHEAD_CONTENT_BOTTOM_MIN_MM, pageHeight * LETTERHEAD_CONTENT_BOTTOM_SAFE_AREA_RATIO);
  const maxWidth = pageWidth - (marginX * 2);
  const bodySize = 10.9;
  // Single spacing stays exactly as before, so existing letters are unchanged.
  const lineSpacing = Math.max(1, Math.min(3, Number(options.lineSpacing) || 1));
  const bodyLineHeight = 6.5 * lineSpacing;
  // The gap between paragraphs opens up with the leading, but more gently, so
  // double spacing does not leave a chasm between them.
  const paragraphGap = 1.5 * (1 + (lineSpacing - 1) * 0.6);
  const [firstBackground, secondBackground, signature, stamp] = await Promise.all([
    options.firstPageUrl ? loadImage(options.firstPageUrl) : Promise.resolve(null),
    options.hasSecondPage && options.secondPageUrl ? loadImage(options.secondPageUrl) : Promise.resolve(null),
    includeSignature && options.signatureUrl ? loadImage(options.signatureUrl) : Promise.resolve(null),
    includeStamp && options.stampUrl ? loadImage(options.stampUrl) : Promise.resolve(null),
  ]);
  const additionalSignatures = includeSignature
    ? (await Promise.all((options.signatures || []).map(async (placed) => ({ placed, asset: placed.signatureUrl ? await loadImage(placed.signatureUrl) : null })))).filter((entry) => entry.asset)
    : [];

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

  function addVerticalSpace(height: number) {
    // Spacing alone must never create an empty trailing page. The next
    // rendered line/image performs the page-boundary check and starts cleanly
    // on the continuation page when needed.
    y += height;
  }

  type StyledChar = {
    ch: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color?: readonly [number, number, number];
    size: number;
  };

  function fontStyle(char: StyledChar) {
    if (char.bold && char.italic) return "bolditalic";
    if (char.bold) return "bold";
    if (char.italic) return "italic";
    return "normal";
  }

  function drawRichSpans(
    spans: RichSpan[],
    options: {
      size: number;
      bold?: boolean;
      lineHeight: number;
      align?: RichAlignment;
      indent?: number;
      color?: readonly [number, number, number];
      fontName?: string;
    },
  ) {
    const defaultFontName = (doc as any).getFont?.()?.fontName || "helvetica";
    const fontName = options.fontName || defaultFontName;
    const chars: StyledChar[] = [];
    for (const span of spans) {
      const parsedColor = span.color ? hexToRgb(span.color) : undefined;
      const color = parsedColor && parsedColor.every(Number.isFinite)
        ? parsedColor as readonly [number, number, number]
        : options.color;
      for (const ch of span.text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ")) {
        chars.push({
          ch,
          bold: !!span.bold || !!options.bold,
          italic: !!span.italic,
          underline: !!span.underline,
          color,
          size: span.fontSize || options.size,
        });
      }
    }

    const indent = options.indent || 0;
    const usableWidth = maxWidth - indent;
    const lines: StyledChar[][] = [];
    let line: StyledChar[] = [];
    let lastWordBoundary = 0;

    const measure = (characters: StyledChar[]) => {
      let width = 0;
      for (const char of characters) {
        doc.setFont(fontName, fontStyle(char));
        doc.setFontSize(char.size);
        width += doc.getTextWidth(char.ch);
      }
      return width;
    };
    const flush = () => {
      lines.push(line);
      line = [];
      lastWordBoundary = 0;
    };

    for (const char of chars) {
      if (char.ch === "\n") {
        flush();
        continue;
      }
      line.push(char);
      if (char.ch === " " || char.ch === "\t") lastWordBoundary = line.length;
      if (measure(line) <= usableWidth) continue;
      if (lastWordBoundary > 0 && lastWordBoundary < line.length) {
        const carry = line.splice(lastWordBoundary);
        flush();
        while (carry.length && /\s/.test(carry[0].ch)) carry.shift();
        line.push(...carry);
      } else {
        const carry = line.pop();
        flush();
        if (carry) line.push(carry);
      }
    }
    if (line.length || !lines.length) flush();

    lines.forEach((characters, lineIndex) => {
      const largestSize = characters.reduce((largest, char) => Math.max(largest, char.size), options.size);
      const lineHeight = Math.max(options.lineHeight, largestSize * 0.352778 * 1.35);
      ensureSpace(lineHeight);
      const lineWidth = measure(characters);
      let x = marginX + indent;
      if (options.align === "center") x += Math.max(0, (usableWidth - lineWidth) / 2);
      if (options.align === "right") x += Math.max(0, usableWidth - lineWidth);

      const spaces = characters.filter((char) => char.ch === " ").length;
      const justify = options.align === "justify" && lineIndex < lines.length - 1 && spaces > 0;
      const extraSpace = justify ? Math.max(0, usableWidth - lineWidth) / spaces : 0;

      for (const char of characters) {
        doc.setFont(fontName, fontStyle(char));
        doc.setFontSize(char.size);
        const color = char.color || [25, 32, 48] as const;
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(char.ch, x, y);
        const charWidth = doc.getTextWidth(char.ch);
        if (char.underline && char.ch.trim()) {
          doc.setDrawColor(color[0], color[1], color[2]);
          doc.setLineWidth(0.18);
          doc.line(x, y + 0.65, x + charWidth, y + 0.65);
        }
        x += charWidth + (char.ch === " " ? extraSpace : 0);
      }
      y += lineHeight;
    });

    doc.setFont(defaultFontName, "normal");
    doc.setFontSize(bodySize);
    doc.setTextColor(25, 32, 48);
  }

  function drawListMarker(marker: string, spans: RichSpan[], indexWidth: number) {
    const fontName = (doc as any).getFont?.()?.fontName || "helvetica";
    ensureSpace(bodyLineHeight);
    doc.setFont(fontName, "normal");
    doc.setFontSize(bodySize);
    doc.setTextColor(25, 32, 48);
    doc.text(marker, marginX + 1, y);
    drawRichSpans(spans, { size: bodySize, lineHeight: bodyLineHeight, indent: indexWidth });
    addVerticalSpace(0.8);
  }

  const blocks = parseRichHtmlToBlocks(options.bodyHtml || "");
  for (const block of blocks) {
    if (block.kind === "blank") { addVerticalSpace(bodyLineHeight); continue; }
    if (block.kind === "hr") {
      ensureSpace(8);
      y += 2.5;
      doc.setDrawColor(200, 205, 215);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 5.5;
      continue;
    }
    if (block.kind === "h1") {
      addVerticalSpace(4.2);
      drawRichSpans(block.spans, { size: 21.6, bold: true, lineHeight: 9.4, align: block.align });
      addVerticalSpace(2.2);
      continue;
    }
    if (block.kind === "h2") {
      addVerticalSpace(3.8);
      drawRichSpans(block.spans, { size: 16.8, bold: true, lineHeight: 8, align: block.align });
      addVerticalSpace(1.8);
      continue;
    }
    if (block.kind === "h3") {
      addVerticalSpace(3.4);
      drawRichSpans(block.spans, { size: 13.8, bold: true, lineHeight: 7.2, align: block.align });
      addVerticalSpace(1.5);
      continue;
    }
    if (block.kind === "bullet") { drawListMarker("•", block.spans, 6); continue; }
    if (block.kind === "ordered") { drawListMarker(`${block.index}.`, block.spans, 8); continue; }
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
    if (block.kind === "blockquote") {
      ensureSpace(bodyLineHeight + 3);
      const quoteY = y - 3.5;
      doc.setDrawColor(10, 79, 232);
      doc.setLineWidth(0.8);
      doc.line(marginX + 1, quoteY, marginX + 1, quoteY + bodyLineHeight + 3);
      drawRichSpans(block.spans, {
        size: bodySize,
        lineHeight: bodyLineHeight,
        align: block.align,
        indent: 6,
        color: [75, 85, 105],
      });
      addVerticalSpace(1.5);
      continue;
    }
    if (block.kind === "pre") {
      addVerticalSpace(1.8);
      drawRichSpans(block.spans, {
        size: 9.5,
        lineHeight: 5.8,
        align: block.align,
        indent: 4,
        color: [45, 55, 72],
        fontName: "courier",
      });
      addVerticalSpace(2.2);
      continue;
    }
    drawRichSpans(block.spans, { size: bodySize, lineHeight: bodyLineHeight, align: block.align });
    addVerticalSpace(paragraphGap);
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

  for (const { placed, asset } of additionalSignatures) {
    if (!asset || (placed.status !== "ready" && placed.status !== "signed")) continue;
    const targetPage = placed.signaturePage === "first" ? 1 : pageNumber;
    doc.setPage(targetPage);
    const width = pageWidth * Math.min(80, Math.max(5, placed.signatureWidth)) / 100;
    const height = width * asset.height / asset.width;
    const x = Math.min(pageWidth - width, Math.max(0, pageWidth * placed.signatureX / 100));
    const placedY = Math.min(pageHeight - height, Math.max(0, pageHeight * placed.signatureY / 100));
    doc.addImage(asset.dataUrl, "PNG", x, placedY, width, height);
  }

  if (stamp && includeStamp) {
    const targetPage = options.stampPage === "first" ? 1 : pageNumber;
    doc.setPage(targetPage);
    const width = pageWidth * Math.min(80, Math.max(5, options.stampWidth)) / 100;
    const height = width * stamp.height / stamp.width;
    const x = Math.min(pageWidth - width, Math.max(0, pageWidth * options.stampX / 100));
    const stampY = Math.min(pageHeight - height, Math.max(0, pageHeight * options.stampY / 100));
    doc.addImage(stamp.dataUrl, "PNG", x, stampY, width, height);
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
