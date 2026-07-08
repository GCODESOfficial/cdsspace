/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared cDocs → branded PDF exporter. Matches the invoice/resume branding:
// CDS Space header, website, date, page numbers at the footer.

import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import { DEFAULT_CDOC_THEME, normalizeCDocTheme, type CDocTheme } from "@/lib/cdocs-theme";
import { parseCDocBody, type CDocSpan } from "@/lib/cdocs-markdown";
import { isHtmlBody, parseRichHtmlToBlocks, hexToRgb, type RichBlock } from "@/lib/cdocs-html";

export type CDocPdfOptions = {
  title: string;
  body: string;
  shareUrl?: string;
  theme?: CDocTheme;
  // When true, draw a faint circular CDS Space stamp at the bottom-right of
  // the last page.
  stamped?: boolean;
  // Optional signature overlay (used by cSign signed export)
  signature?: {
    dataUrl: string;         // PNG data URL
    signedByName?: string;
    signedAt?: string;       // ISO
  };
};

const MARGIN_X = 20;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 22;
const LINE_HEIGHT = 5.8;

// Cached rasterized PNGs (logo + official seal). jsPDF can't render SVGs
// natively, and embedding raw PNGs is fine via addImage. We cache one promise
// per asset for the lifetime of the page.
const LOGO_SRC = "/images/cds-logo.svg";
const SEAL_SRC = "/CDS_Seal.png";
const LOGO_RENDER_W = 256; // px
const SEAL_RENDER_W = 512; // px - bigger so the embossed seal stays crisp

type RasterAsset = { dataUrl: string; width: number; height: number } | null;
const assetCache = new Map<string, Promise<RasterAsset>>();

function loadAsset(src: string, renderWidth: number, fallbackAspect = 1): Promise<RasterAsset> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const cached = assetCache.get(src);
  if (cached) return cached;
  const p = new Promise<RasterAsset>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const aspect = img.naturalHeight / img.naturalWidth || fallbackAspect;
        const w = renderWidth;
        const h = Math.round(w * aspect);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL("image/png"), width: w, height: h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  assetCache.set(src, p);
  return p;
}

const loadLogo = () => loadAsset(LOGO_SRC, LOGO_RENDER_W, 71 / 153);
const loadSeal = () => loadAsset(SEAL_SRC, SEAL_RENDER_W, 1);

export async function exportCDocToPdf(opts: CDocPdfOptions) {
  // Pre-load both raster assets in parallel so the PDF render isn't blocked twice.
  const [logo, seal] = await Promise.all([loadLogo(), opts.stamped ? loadSeal() : Promise.resolve(null)]);
  const doc = new jsPDF();
  installBrandFont(doc);
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const theme = normalizeCDocTheme(opts.theme || DEFAULT_CDOC_THEME);
  const palette = theme === "light" ? {
    bg: [255, 255, 255] as const,
    title: [10, 10, 10] as const,
    body: [35, 35, 35] as const,
    meta: [45, 45, 45] as const,
    muted: [110, 110, 110] as const,
    line: [220, 220, 220] as const,
    footer: [120, 120, 120] as const,
  } : {
    bg: [0, 0, 0] as const,
    title: [255, 255, 255] as const,
    body: [220, 220, 220] as const,
    meta: [200, 200, 200] as const,
    muted: [100, 100, 100] as const,
    line: [30, 30, 30] as const,
    footer: [70, 70, 70] as const,
  };
  const setFill = (rgb: readonly [number, number, number]) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const setText = (rgb: readonly [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const setDraw = (rgb: readonly [number, number, number]) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  const drawHeader = () => {
    // Background
    setFill(palette.bg);
    doc.rect(0, 0, w, h, "F");

    // Logo (rasterized SVG). Falls back to wordmark text if the image
    // didn't load (e.g. server-side render).
    let tagX = MARGIN_X;
    if (logo) {
      const logoH = 10; // mm - keeps the header tidy
      const logoW = (logo.width / logo.height) * logoH;
      doc.addImage(logo.dataUrl, "PNG", MARGIN_X, 14, logoW, logoH);
      tagX = MARGIN_X; // tagline still anchored to the left margin
    } else {
      doc.setFontSize(18); setText(palette.title);
      doc.text("CDS Space", MARGIN_X, 22);
    }
    doc.setFontSize(9); setText(palette.muted);
    doc.text("CDS Space Branding Agency", tagX, 28);

    // Right meta
    doc.setFontSize(11); setText(palette.meta);
    doc.text("cDOCS", w - MARGIN_X, 22, { align: "right" });
    doc.setFontSize(8); setText(palette.muted);
    doc.text(new Date().toLocaleDateString(), w - MARGIN_X, 28, { align: "right" });

    setDraw(palette.line);
    doc.line(MARGIN_X, 34, w - MARGIN_X, 34);
  };

  const drawFooter = (pageNo: number, totalPages: number) => {
    setDraw(palette.line);
    doc.line(MARGIN_X, h - MARGIN_BOTTOM, w - MARGIN_X, h - MARGIN_BOTTOM);
    doc.setFontSize(7); setText(palette.footer);
    const left = opts.shareUrl ? opts.shareUrl : "cdsspace.pro";
    doc.text(left, MARGIN_X, h - MARGIN_BOTTOM + 6);
    doc.text(new Date().toLocaleString(), w / 2, h - MARGIN_BOTTOM + 6, { align: "center" });
    doc.text(`Page ${pageNo} of ${totalPages}`, w - MARGIN_X, h - MARGIN_BOTTOM + 6, { align: "right" });
  };

  // Page 1
  drawHeader();
  // Title
  doc.setFontSize(20); setText(palette.title);
  doc.text(opts.title || "Untitled", MARGIN_X, MARGIN_TOP);

  // Body - either markdown-lite (legacy) or HTML (rich editor).
  const maxWidth = w - MARGIN_X * 2;
  const usesHtml = isHtmlBody(opts.body || "");
  const richBlocks: RichBlock[] = usesHtml ? parseRichHtmlToBlocks(opts.body || "") : [];
  const blocks = usesHtml ? [] : parseCDocBody(opts.body || "");

  let y = MARGIN_TOP + 10;
  const ensureSpace = (needed: number) => {
    if (y + needed > h - MARGIN_BOTTOM - 6) {
      doc.addPage();
      drawHeader();
      y = MARGIN_TOP;
    }
  };

  // Draw one run of spans on a single line, switching font weight / drawing
  // underlines inline. We pre-compute the full wrapped line list from the
  // plain-text representation, then render each wrapped line by walking the
  // spans and advancing an x cursor.
  const drawSpansWrapped = (spans: CDocSpan[], opts2: { size: number; bold?: boolean; lineGap: number }) => {
    doc.setFontSize(opts2.size);
    setText(palette.body);
    const fontName = (doc as any).getFont?.()?.fontName || "helvetica";
    // Flatten spans to characters annotated with style so we can wrap
    // greedily without losing style boundaries.
    type StyledChar = { ch: string; bold: boolean; underline: boolean };
    const chars: StyledChar[] = [];
    for (const s of spans) {
      const bold = s.type === "bold" || !!opts2.bold;
      const underline = s.type === "underline";
      for (const ch of s.text) chars.push({ ch, bold, underline });
    }

    // Break into wrapped lines using word boundaries.
    const lines: StyledChar[][] = [];
    let line: StyledChar[] = [];
    const flushLine = () => { lines.push(line); line = []; };
    const measureLine = (l: StyledChar[]) => {
      // Set font mode conservatively per char to measure accurately; this is
      // slow in theory but the content size stays small.
      let wsum = 0;
      for (const c of l) {
        doc.setFont(fontName, c.bold ? "bold" : "normal");
        wsum += doc.getTextWidth(c.ch);
      }
      return wsum;
    };
    let wordStart = 0;
    for (let i = 0; i < chars.length; i++) {
      line.push(chars[i]);
      if (chars[i].ch === " " || chars[i].ch === "\t") wordStart = line.length;
      if (measureLine(line) > maxWidth) {
        // Overflow - rewind to last word boundary if possible.
        if (wordStart > 0 && wordStart < line.length) {
          const carry = line.splice(wordStart);
          flushLine();
          // Drop leading whitespace of the carry
          while (carry.length && (carry[0].ch === " " || carry[0].ch === "\t")) carry.shift();
          line.push(...carry);
          wordStart = 0;
        } else {
          // One long word wider than the line - hard-break.
          const carry = [line.pop()!];
          flushLine();
          line.push(...carry);
          wordStart = 0;
        }
      }
    }
    if (line.length) flushLine();

    for (const wrapped of lines) {
      ensureSpace(opts2.lineGap);
      let x = MARGIN_X;
      for (const c of wrapped) {
        doc.setFont(fontName, c.bold ? "bold" : "normal");
        doc.text(c.ch, x, y);
        const wch = doc.getTextWidth(c.ch);
        if (c.underline) {
          setDraw(palette.body);
          doc.setLineWidth(0.2);
          doc.line(x, y + 0.6, x + wch, y + 0.6);
        }
        x += wch;
      }
      y += opts2.lineGap;
    }
    doc.setFont(fontName, "normal");
  };

  if (!usesHtml) {
    for (const block of blocks) {
      if (block.kind === "blank") {
        y += LINE_HEIGHT * 0.6;
        continue;
      }
      if (block.kind === "h1") {
        y += 2;
        drawSpansWrapped(block.spans, { size: 16, bold: true, lineGap: 7.5 });
        y += 2;
        continue;
      }
      if (block.kind === "h2") {
        y += 1;
        drawSpansWrapped(block.spans, { size: 13, bold: true, lineGap: 6.8 });
        y += 1;
        continue;
      }
      if (block.kind === "bullet") {
        ensureSpace(LINE_HEIGHT);
        doc.setFontSize(10); setText(palette.body);
        doc.text("•", MARGIN_X, y);
        const indented = [{ type: "text" as const, text: "   " }, ...block.spans];
        drawSpansWrapped(indented, { size: 10, lineGap: LINE_HEIGHT });
        continue;
      }
      drawSpansWrapped(block.spans, { size: 10, lineGap: LINE_HEIGHT });
    }
  } else {
    /* ------------------- Rich-HTML block rendering ------------------- */
    const drawRichSpans = (
      spans: { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string }[],
      opts2: { size: number; bold?: boolean; lineGap: number; align?: "left" | "center" | "right"; indent?: number }
    ) => {
      doc.setFontSize(opts2.size);
      const fontName = (doc as any).getFont?.()?.fontName || "helvetica";
      type SC = { ch: string; bold: boolean; italic: boolean; underline: boolean; color?: readonly [number, number, number] };
      const chars: SC[] = [];
      for (const s of spans) {
        const bold = !!s.bold || !!opts2.bold;
        const italic = !!s.italic;
        const underline = !!s.underline;
        const color = s.color ? (hexToRgb(s.color) as readonly [number, number, number]) : undefined;
        // Preserve explicit newlines (<br>)
        for (const ch of s.text.replace(/\r\n/g, "\n")) chars.push({ ch, bold, italic, underline, color });
      }

      const indent = opts2.indent ?? 0;
      const innerMax = maxWidth - indent;
      const wrapped: SC[][] = [];
      let line: SC[] = [];
      const flush = () => { wrapped.push(line); line = []; };
      const measure = (l: SC[]) => {
        let acc = 0;
        for (const c of l) {
          const style = c.bold && c.italic ? "bolditalic" : c.bold ? "bold" : c.italic ? "italic" : "normal";
          doc.setFont(fontName, style);
          acc += doc.getTextWidth(c.ch);
        }
        return acc;
      };

      let wordStart = 0;
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if (c.ch === "\n") { flush(); wordStart = 0; continue; }
        line.push(c);
        if (c.ch === " " || c.ch === "\t") wordStart = line.length;
        if (measure(line) > innerMax) {
          if (wordStart > 0 && wordStart < line.length) {
            const carry = line.splice(wordStart);
            flush();
            while (carry.length && (carry[0].ch === " " || carry[0].ch === "\t")) carry.shift();
            line.push(...carry);
            wordStart = 0;
          } else {
            const carry = [line.pop()!];
            flush();
            line.push(...carry);
            wordStart = 0;
          }
        }
      }
      if (line.length) flush();

      for (const lineArr of wrapped) {
        ensureSpace(opts2.lineGap);
        const lineW = measure(lineArr);
        let startX = MARGIN_X + indent;
        if (opts2.align === "center") startX = MARGIN_X + indent + (innerMax - lineW) / 2;
        else if (opts2.align === "right") startX = MARGIN_X + indent + (innerMax - lineW);
        let x = startX;
        for (const c of lineArr) {
          const style = c.bold && c.italic ? "bolditalic" : c.bold ? "bold" : c.italic ? "italic" : "normal";
          doc.setFont(fontName, style);
          if (c.color) setText(c.color); else setText(palette.body);
          doc.text(c.ch, x, y);
          const wch = doc.getTextWidth(c.ch);
          if (c.underline) {
            setDraw(c.color || palette.body);
            doc.setLineWidth(0.2);
            doc.line(x, y + 0.6, x + wch, y + 0.6);
          }
          x += wch;
        }
        y += opts2.lineGap;
      }
      doc.setFont(fontName, "normal");
      setText(palette.body);
    };

    for (const block of richBlocks) {
      if (block.kind === "blank") { y += LINE_HEIGHT * 0.6; continue; }
      if (block.kind === "hr") {
        ensureSpace(6);
        y += 2;
        setDraw(palette.line);
        doc.setLineWidth(0.3);
        doc.line(MARGIN_X, y, w - MARGIN_X, y);
        y += 4;
        continue;
      }
      if (block.kind === "image") {
        try {
          const maxImgW = maxWidth;
          const targetW = Math.min(block.width || maxImgW * 0.7, maxImgW);
          // Attempt to measure real aspect via a hidden <img> (best-effort in browsers)
          const asset = await loadAsset(block.src, Math.max(600, Math.round(targetW * 4)), 0.6);
          const aspect = asset ? asset.height / asset.width : 0.6;
          const imgW = asset ? targetW : targetW;
          const imgH = block.height && block.width ? (block.height / block.width) * imgW : imgW * aspect;
          ensureSpace(imgH + 6);
          let x = MARGIN_X;
          if (block.align === "center") x = MARGIN_X + (maxWidth - imgW) / 2;
          else if (block.align === "right") x = MARGIN_X + (maxWidth - imgW);
          if (asset) doc.addImage(asset.dataUrl, "PNG", x, y, imgW, imgH);
          y += imgH + 4;
        } catch { /* skip unloadable images */ }
        continue;
      }
      if (block.kind === "h1") {
        y += 2;
        drawRichSpans(block.spans, { size: 16, bold: true, lineGap: 7.8, align: block.align });
        y += 2; continue;
      }
      if (block.kind === "h2") {
        y += 1;
        drawRichSpans(block.spans, { size: 13, bold: true, lineGap: 6.8, align: block.align });
        y += 1; continue;
      }
      if (block.kind === "bullet") {
        ensureSpace(LINE_HEIGHT);
        doc.setFontSize(10); setText(palette.body);
        doc.text("•", MARGIN_X + 2, y);
        drawRichSpans(block.spans, { size: 10, lineGap: LINE_HEIGHT, indent: 6 });
        continue;
      }
      if (block.kind === "ordered") {
        ensureSpace(LINE_HEIGHT);
        doc.setFontSize(10); setText(palette.body);
        doc.text(`${block.index}.`, MARGIN_X + 1, y);
        drawRichSpans(block.spans, { size: 10, lineGap: LINE_HEIGHT, indent: 7 });
        continue;
      }
      // paragraph
      drawRichSpans(block.spans, { size: 10, lineGap: LINE_HEIGHT, align: block.align });
    }
  }

  // Optional signature overlay on the last page, bottom-center
  if (opts.signature?.dataUrl) {
    const sigWidth = 60;
    const sigHeight = 22;
    const sx = (w - sigWidth) / 2;
    // Ensure we have room; if not, add a new page
    const spaceNeeded = sigHeight + 30;
    if (y > h - MARGIN_BOTTOM - spaceNeeded) {
      doc.addPage();
      drawHeader();
      y = MARGIN_TOP;
    } else {
      y += 10;
    }

    // Divider
    setDraw(palette.line);
    doc.line(MARGIN_X, y, w - MARGIN_X, y);
    y += 10;

    doc.setFontSize(9); setText(palette.muted);
    doc.text("Signature:", MARGIN_X, y);
    y += 3;

    try {
      doc.addImage(opts.signature.dataUrl, "PNG", sx, y, sigWidth, sigHeight);
    } catch { /* swallow */ }

    y += sigHeight + 4;
    doc.setFontSize(8); setText(palette.muted);
    if (opts.signature.signedByName) {
      doc.text(`Signed by ${opts.signature.signedByName}`, w / 2, y, { align: "center" });
      y += 4;
    }
    if (opts.signature.signedAt) {
      doc.text(`${new Date(opts.signature.signedAt).toLocaleString()}`, w / 2, y, { align: "center" });
    }
  }

  // Footers with accurate page numbers
  const pageCount = (doc as any).internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(i, pageCount);
  }

  // Official CDS Space seal on the last page, bottom-right.
  if (opts.stamped && seal) {
    doc.setPage(pageCount);
    const sealSize = 36; // mm - keeps it visible without overpowering signatures
    const sealX = w - MARGIN_X - sealSize;
    const sealY = h - MARGIN_BOTTOM - sealSize - 4;
    doc.addImage(seal.dataUrl, "PNG", sealX, sealY, sealSize, sealSize);
  } else if (opts.stamped) {
    // Fallback: keep the geometric stamp if the seal failed to load.
    doc.setPage(pageCount);
    drawCircularStamp(doc, w - MARGIN_X - 24, h - MARGIN_BOTTOM - 24, palette);
  }

  doc.save(`CDSSpace-${(opts.title || "document").replace(/\s+/g, "-").slice(0, 60)}.pdf`);
}

// ---------------------------------------------------------------------------
// Circular stamp: two thin concentric rings + curved text + small CDS Space
// wordmark in the center. Drawn faint by using the palette's muted color
// (no GState/opacity to stay compatible across jsPDF versions).
// ---------------------------------------------------------------------------
function drawCircularStamp(
  doc: jsPDF,
  cx: number,
  cy: number,
  palette: { muted: readonly [number, number, number]; line: readonly [number, number, number] }
) {
  // Use the muted color for everything - already reads as "faint" against
  // either the dark-bg or light-bg theme.
  doc.setDrawColor(palette.muted[0], palette.muted[1], palette.muted[2]);
  doc.setTextColor(palette.muted[0], palette.muted[1], palette.muted[2]);
  doc.setLineWidth(0.35);

  const outer = 22;
  const inner = 18;
  doc.circle(cx, cy, outer, "S");
  doc.circle(cx, cy, inner, "S");

  // Curved text along a radius between the two rings.
  const text = "CDS SPACE · FULL-SERVICE BRANDING AGENCY · ";
  const textRadius = (outer + inner) / 2;
  // Spread the chars evenly around the full circle.
  const total = text.length;
  doc.setFontSize(5.5);
  for (let i = 0; i < total; i++) {
    // Start at the top (12 o'clock = -90°) and go clockwise.
    const fraction = i / total;
    const angleDeg = -90 + fraction * 360;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = cx + textRadius * Math.cos(angleRad);
    const y = cy + textRadius * Math.sin(angleRad);
    // Rotate each char so its baseline tangents the circle (text head
    // points outward).
    const rot = -angleDeg - 90;
    doc.text(text[i], x, y, { angle: rot, align: "center", baseline: "middle" } as any);
  }

  // Center wordmark - bold "CDS Space" stacked tight inside the inner ring.
  const oldFont = (doc as any).getFont?.();
  doc.setFontSize(8);
  doc.setFont(oldFont?.fontName || "helvetica", "bold");
  doc.text("CDS", cx, cy - 1, { align: "center", baseline: "middle" } as any);
  doc.setFontSize(6);
  doc.setFont(oldFont?.fontName || "helvetica", "normal");
  doc.text("Space", cx, cy + 4.5, { align: "center", baseline: "middle" } as any);

  // Small star/dot mark to keep symmetry - 12 o'clock + 6 o'clock decorations.
  doc.setFontSize(6);
  doc.text("●", cx, cy - inner + 2, { align: "center", baseline: "middle" } as any);
  doc.text("●", cx, cy + inner - 2, { align: "center", baseline: "middle" } as any);
}
