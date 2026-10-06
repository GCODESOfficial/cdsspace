/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { readFile } from "fs/promises";
import path from "path";
import jsPDF from "jspdf";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import { isHtmlBody } from "@/lib/cdocs-html";
import { parseCDocBody, type CDocSpan } from "@/lib/cdocs-markdown";
import { DEFAULT_CDOC_THEME, normalizeCDocTheme } from "@/lib/cdocs-theme";

/**
 * Server-side cDocs → branded PDF for the mobile app, which has no browser to
 * run src/lib/cdocs-pdf.ts (that one draws in the browser and calls save()).
 * Same layout: CDS Space header, title, body (markdown-lite or the rich
 * editor's HTML, reduced to headings / bullets / bold / underline), page
 * footers, the optional CDS Space seal and an optional cSign signature.
 */

export type MobileCDocPdf = {
  title: string;
  body: string;
  theme?: string | null;
  stamped?: boolean;
  shareUrl?: string;
  signature?: { image: string | null; signedAt?: string | null; signedBy?: string | null };
};

const MARGIN_X = 20;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 22;
const LINE_HEIGHT = 5.8;

const NAMED_ENTITIES: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"', hellip: "...", mdash: "-", ndash: "-", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };

function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (/^#x/i.test(entity)) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16) || 32);
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10) || 32);
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** The rich editor's HTML → the markdown-lite the renderer below understands. */
export function cdocHtmlToMarkdownLite(html: string) {
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h1\b[^>]*>/gi, "\n# ")
    .replace(/<h[23]\b[^>]*>/gi, "\n## ")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/(h[1-3]|p|div|li|blockquote|pre|ul|ol|figure)>/gi, "\n")
    .replace(/<hr\b[^>]*>/gi, "\n")
    .replace(/<\/?(strong|b|em|i)\b[^>]*>/gi, "**")
    .replace(/<\/?u\b[^>]*>/gi, "__")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/ /g, " ")
    .replace(/\*\*\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sealImage(): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "CDS_Seal.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

// Signatures are PNG data URLs from the signing page; older rows may hold a link.
async function signatureImage(source: string | null | undefined): Promise<string | null> {
  if (!source) return null;
  if (source.startsWith("data:image/")) return source;
  if (!/^https?:\/\//i.test(source)) return null;
  try {
    const res = await fetch(source);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/png";
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function buildMobileCDocPdf(opts: MobileCDocPdf): Promise<ArrayBuffer> {
  const [seal, signature] = await Promise.all([opts.stamped ? sealImage() : Promise.resolve(null), signatureImage(opts.signature?.image)]);
  const doc = new jsPDF();
  installBrandFont(doc);
  const font = "NeueCampton";
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const light = normalizeCDocTheme(opts.theme || DEFAULT_CDOC_THEME) === "light";
  type Rgb = readonly [number, number, number];
  const palette: Record<"bg" | "title" | "body" | "meta" | "muted" | "line" | "footer", Rgb> = light
    ? { bg: [255, 255, 255], title: [10, 10, 10], body: [35, 35, 35], meta: [45, 45, 45], muted: [110, 110, 110], line: [220, 220, 220], footer: [120, 120, 120] }
    : { bg: [0, 0, 0], title: [255, 255, 255], body: [220, 220, 220], meta: [200, 200, 200], muted: [100, 100, 100], line: [30, 30, 30], footer: [70, 70, 70] };
  const setText = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]);
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

  const drawHeader = () => {
    doc.setFillColor(palette.bg[0], palette.bg[1], palette.bg[2]);
    doc.rect(0, 0, w, h, "F");
    doc.setFont(font, "bold");
    doc.setFontSize(18);
    setText(palette.title);
    doc.text("CDS Space", MARGIN_X, 22);
    doc.setFont(font, "normal");
    doc.setFontSize(9);
    setText(palette.muted);
    doc.text("CDS Space Branding Agency", MARGIN_X, 28);
    doc.setFontSize(11);
    setText(palette.meta);
    doc.text("cDOCS", w - MARGIN_X, 22, { align: "right" });
    doc.setFontSize(8);
    setText(palette.muted);
    doc.text(dateLabel, w - MARGIN_X, 28, { align: "right" });
    setDraw(palette.line);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, 34, w - MARGIN_X, 34);
  };

  drawHeader();
  doc.setFont(font, "bold");
  doc.setFontSize(20);
  setText(palette.title);
  const titleLines = doc.splitTextToSize(opts.title || "Untitled", w - MARGIN_X * 2) as string[];
  doc.text(titleLines.slice(0, 2), MARGIN_X, MARGIN_TOP);
  let y = MARGIN_TOP + 10 + (Math.min(titleLines.length, 2) - 1) * 8;

  const ensureSpace = (needed: number) => {
    if (y + needed > h - MARGIN_BOTTOM - 6) {
      doc.addPage();
      drawHeader();
      y = MARGIN_TOP;
    }
  };

  // Word-wraps styled runs and draws them, switching weight/underline per word.
  const maxWidth = w - MARGIN_X * 2;
  const drawSpans = (spans: CDocSpan[], o: { size: number; bold?: boolean; lineGap: number; indent?: number }) => {
    doc.setFontSize(o.size);
    setText(o.bold ? palette.title : palette.body);
    type Word = { text: string; bold: boolean; underline: boolean };
    const words: Word[] = [];
    for (const s of spans) {
      const bold = s.type === "bold" || !!o.bold;
      const underline = s.type === "underline";
      s.text.split(/(\s+)/).forEach((part) => {
        if (part) words.push({ text: part, bold, underline });
      });
    }
    const width = (word: Word) => {
      doc.setFont(font, word.bold ? "bold" : "normal");
      return doc.getTextWidth(word.text);
    };
    const room = maxWidth - (o.indent || 0);
    const lines: Word[][] = [[]];
    let used = 0;
    for (const word of words) {
      const ww = width(word);
      const blank = !word.text.trim();
      if (used + ww > room && lines[lines.length - 1].length && !blank) {
        lines.push([]);
        used = 0;
      }
      if (blank && used === 0) continue;
      lines[lines.length - 1].push(word);
      used += ww;
    }
    for (const line of lines) {
      ensureSpace(o.lineGap);
      let x = MARGIN_X + (o.indent || 0);
      for (const word of line) {
        const ww = width(word);
        doc.text(word.text, x, y);
        if (word.underline && word.text.trim()) {
          setDraw(palette.body);
          doc.setLineWidth(0.2);
          doc.line(x, y + 0.6, x + ww, y + 0.6);
        }
        x += ww;
      }
      y += o.lineGap;
    }
    doc.setFont(font, "normal");
  };

  const body = opts.body || "";
  const blocks = parseCDocBody(isHtmlBody(body) ? cdocHtmlToMarkdownLite(body) : body);
  for (const block of blocks) {
    if (block.kind === "blank") {
      y += LINE_HEIGHT * 0.6;
    } else if (block.kind === "h1") {
      y += 2;
      drawSpans(block.spans, { size: 16, bold: true, lineGap: 7.5 });
      y += 2;
    } else if (block.kind === "h2") {
      y += 1;
      drawSpans(block.spans, { size: 13, bold: true, lineGap: 6.5 });
      y += 1;
    } else if (block.kind === "bullet") {
      ensureSpace(LINE_HEIGHT);
      doc.setFontSize(11);
      setText(palette.body);
      doc.text("•", MARGIN_X + 1, y);
      drawSpans(block.spans, { size: 11, lineGap: LINE_HEIGHT, indent: 6 });
    } else {
      drawSpans(block.spans, { size: 11, lineGap: LINE_HEIGHT });
    }
  }

  if (opts.signature) {
    const sigW = 60;
    const sigH = 22;
    ensureSpace(sigH + 30);
    y += 10;
    setDraw(palette.line);
    doc.line(MARGIN_X, y, w - MARGIN_X, y);
    y += 10;
    doc.setFontSize(9);
    setText(palette.muted);
    doc.text("Signature:", MARGIN_X, y);
    y += 3;
    if (signature) {
      try {
        doc.addImage(signature, "PNG", (w - sigW) / 2, y, sigW, sigH);
      } catch {
        // Unreadable image: the signed line below still records it.
      }
    }
    y += sigH + 4;
    doc.setFontSize(8);
    if (opts.signature.signedBy) {
      doc.text(`Signed by ${opts.signature.signedBy}`, w / 2, y, { align: "center" });
      y += 4;
    }
    if (opts.signature.signedAt) {
      const at = new Date(opts.signature.signedAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" });
      doc.text(`Signed ${at}`, w / 2, y, { align: "center" });
    }
  }

  const pageCount = doc.getNumberOfPages();
  const stampedAt = now.toLocaleString("en-GB", { timeZone: "Africa/Lagos" });
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    setDraw(palette.line);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, h - MARGIN_BOTTOM, w - MARGIN_X, h - MARGIN_BOTTOM);
    doc.setFont(font, "normal");
    doc.setFontSize(7);
    setText(palette.footer);
    doc.text(opts.shareUrl || "cdsspace.pro", MARGIN_X, h - MARGIN_BOTTOM + 6);
    doc.text(stampedAt, w / 2, h - MARGIN_BOTTOM + 6, { align: "center" });
    doc.text(`Page ${page} of ${pageCount}`, w - MARGIN_X, h - MARGIN_BOTTOM + 6, { align: "right" });
  }

  if (opts.stamped) {
    doc.setPage(pageCount);
    const size = 36;
    let drawn = false;
    if (seal) {
      try {
        doc.addImage(seal, "PNG", w - MARGIN_X - size, h - MARGIN_BOTTOM - size - 4, size, size);
        drawn = true;
      } catch {
        drawn = false;
      }
    }
    if (!drawn) {
      // Plain ring seal when the image isn't available on this server.
      const cx = w - MARGIN_X - 24;
      const cy = h - MARGIN_BOTTOM - 24;
      setDraw(palette.muted);
      setText(palette.muted);
      doc.setLineWidth(0.35);
      doc.circle(cx, cy, 22, "S");
      doc.circle(cx, cy, 18, "S");
      doc.setFont(font, "bold");
      doc.setFontSize(8);
      doc.text("CDS", cx, cy - 1, { align: "center", baseline: "middle" } as any);
      doc.setFont(font, "normal");
      doc.setFontSize(6);
      doc.text("Space", cx, cy + 4.5, { align: "center", baseline: "middle" } as any);
    }
  }

  return doc.output("arraybuffer");
}

export const cdocPdfFileName = (title: string) => `CDSSpace-${(title || "document").replace(/[^\w.-]+/g, "-").slice(0, 60)}.pdf`;

export function pdfResponse(pdf: ArrayBuffer, title: string) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${cdocPdfFileName(title)}"`,
      "Cache-Control": "no-store",
    },
  });
}
