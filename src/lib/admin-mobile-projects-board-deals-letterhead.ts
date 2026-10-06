/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import jsPDF from "jspdf";
import sharp from "sharp";
import { renderPageAsImage, getDocumentProxy } from "unpdf";
import { hexToRgb, type RichAlignment, type RichBlock, type RichSpan } from "@/lib/cdocs-html";
import { installBrandFont } from "@/lib/pdf/pdf-fonts";
import {
  LETTERHEAD_CONTENT_BOTTOM_MIN_MM,
  LETTERHEAD_CONTENT_BOTTOM_SAFE_AREA_RATIO,
  LETTERHEAD_CONTENT_BOTTOM_SMALL_AREA_RATIO,
  LETTERHEAD_CONTENT_BOTTOM_SMALL_MIN_MM,
} from "@/lib/letterhead-pdf";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashQuery } from "@/lib/glashdb/postgres";
import { getLetterhead, isCreatePrivateAssetPath, LETTERHEAD_BUCKET } from "@/lib/create-platform/letterheads";
import type { CreateActor } from "@/lib/create-platform/session";

/**
 * Server-side port of the Executive Board letterhead PDF (src/lib/letterhead-pdf.ts)
 * for the mobile admin app. The web builds the PDF in the browser with jsPDF and
 * renders the preview / smaller export sizes with pdf.js on a canvas; the app has
 * neither, so the same layout runs here and the app receives page images / PDF bytes.
 */

/* ------------------------------------------------------------------ */
/* Minimal HTML tree (the browser's DOMParser stands in on the web).   */
/* ------------------------------------------------------------------ */

type HtmlText = { type: "text"; text: string };
type HtmlElement = { type: "element"; tag: string; attrs: Record<string, string>; children: HtmlNode[] };
type HtmlNode = HtmlText | HtmlElement;

const VOID_TAGS = new Set(["br", "hr", "img", "meta", "link", "input", "col", "wbr", "source"]);
const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "pre", "hr", "figure", "img", "table"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", ndash: "–", mdash: String.fromCharCode(0x2014), hellip: "…", copy: "©",
  reg: "®", trade: "™", bull: "•", middot: "·", euro: "€", pound: "£",
};

function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function parseAttributes(source: string) {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/** Tolerant HTML → tree, enough for the sanitized letterhead body (sanitize-html output). */
export function parseHtmlTree(html: string): HtmlElement {
  const root: HtmlElement = { type: "element", tag: "#root", attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const tagPattern = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const current = () => stack[stack.length - 1];
  const pushText = (text: string) => {
    if (text) current().children.push({ type: "text", text: decodeEntities(text) });
  };
  while ((match = tagPattern.exec(html))) {
    pushText(html.slice(last, match.index));
    last = tagPattern.lastIndex;
    if (!match[1]) continue; // comment
    const tag = match[1].toLowerCase();
    if (match[0][1] === "/") {
      const index = stack.map((node) => node.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const element: HtmlElement = { type: "element", tag, attrs: parseAttributes(match[2] || ""), children: [] };
    // A new <li>/<p> closes an open one, as the HTML parser would.
    if ((tag === "li" || tag === "p") && current().tag === tag) stack.pop();
    current().children.push(element);
    if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(match[2] || "")) stack.push(element);
  }
  pushText(html.slice(last));
  return root;
}

/* ------------------------------------------------------------------ */
/* Tree → RichBlock[] (same rules as parseRichHtmlToBlocks).           */
/* ------------------------------------------------------------------ */

type InlineCtx = { bold: boolean; italic: boolean; underline: boolean; color?: string; fontSize?: number };

const attr = (el: HtmlElement, name: string) => (name in el.attrs ? el.attrs[name] : null);
const textOf = (node: HtmlText) => node.text.replace(/ /g, " ");
const elementChildren = (el: HtmlElement) => el.children.filter((child): child is HtmlElement => child.type === "element");

function hasBlockDescendant(el: HtmlElement): boolean {
  return elementChildren(el).some((child) => BLOCK_TAGS.has(child.tag) || hasBlockDescendant(child));
}

function pickAlign(style: string, fallback: string | null): RichAlignment | undefined {
  const m = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
  if (m) return m[1].toLowerCase() as RichAlignment;
  if (fallback === "center" || fallback === "right" || fallback === "left" || fallback === "justify") return fallback;
  return undefined;
}

function pickFontSize(style: string, htmlSize: string | null): number | undefined {
  const css = style.match(/font-size\s*:\s*([\d.]+)\s*(px|pt|rem|em)?/i);
  if (css) {
    const value = Number(css[1]);
    const unit = (css[2] || "px").toLowerCase();
    if (Number.isFinite(value) && value > 0) {
      if (unit === "pt") return value;
      if (unit === "rem" || unit === "em") return value * 12;
      return value * 0.75;
    }
  }
  if (htmlSize) {
    const size = Math.max(1, Math.min(7, Number.parseInt(htmlSize, 10) || 3));
    return [8, 10, 12, 14, 18, 24, 32][size - 1];
  }
  return undefined;
}

function pickColor(style: string): string | undefined {
  const m = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  return m ? m[1].trim() : undefined;
}

function normalizeColor(c: string): string {
  if (!c) return "#000000";
  if (c.startsWith("#")) return c.length === 4 ? "#" + c.slice(1).split("").map((x) => x + x).join("") : c;
  const m = c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const to = (n: string) => parseInt(n, 10).toString(16).padStart(2, "0");
    return `#${to(m[1])}${to(m[2])}${to(m[3])}`;
  }
  return c;
}

function styleOf(ctx: InlineCtx): Partial<RichSpan> {
  const s: Partial<RichSpan> = {};
  if (ctx.bold) s.bold = true;
  if (ctx.italic) s.italic = true;
  if (ctx.underline) s.underline = true;
  if (ctx.color) s.color = normalizeColor(ctx.color);
  if (ctx.fontSize) s.fontSize = ctx.fontSize;
  return s;
}

function sameStyle(a: RichSpan, b: RichSpan) {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline
    && (a.color || "") === (b.color || "") && (a.fontSize || 0) === (b.fontSize || 0);
}

function collect(node: HtmlNode, ctx: InlineCtx, push: (s: RichSpan) => void) {
  if (node.type === "text") {
    const t = textOf(node);
    if (t) push({ text: t, ...styleOf(ctx) });
    return;
  }
  const el = node;
  const tag = el.tag;
  const next: InlineCtx = { ...ctx };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "a") { next.underline = true; next.color = "#0A4FE8"; }
  const style = attr(el, "style") || "";
  const inlineColor = pickColor(style) || attr(el, "color") || ctx.color;
  if (inlineColor) next.color = inlineColor;
  const inlineFontSize = pickFontSize(style, attr(el, "size"));
  if (inlineFontSize) next.fontSize = inlineFontSize;
  if (/font-weight\s*:\s*(700|bold)/.test(style)) next.bold = true;
  if (style.includes("font-style: italic")) next.italic = true;
  if (style.includes("text-decoration") && /underline/.test(style)) next.underline = true;
  if (tag === "br") { push({ text: "\n", ...styleOf(next) }); return; }
  for (const child of el.children) collect(child, next, push);
}

function collectInline(el: HtmlElement, ctx: InlineCtx): RichSpan[] {
  const out: RichSpan[] = [];
  const push = (s: RichSpan) => {
    const last = out[out.length - 1];
    if (last && sameStyle(last, s)) last.text += s.text;
    else if (s.text) out.push(s);
  };
  for (const child of el.children) collect(child, ctx, push);
  return out;
}

const isBlank = (spans: RichSpan[]) => spans.length === 0 || spans.every((span) => !span.text.replace(/ /g, " ").trim());

function visitBlock(node: HtmlNode, out: RichBlock[], ctx: InlineCtx) {
  if (node.type === "text") {
    const txt = textOf(node);
    if (txt.trim()) out.push({ kind: "paragraph", spans: [{ text: txt, ...styleOf(ctx) }] });
    return;
  }
  const el = node;
  const tag = el.tag;
  const align = pickAlign(attr(el, "style") || "", attr(el, "align"));
  if (tag === "hr") { out.push({ kind: "hr" }); return; }
  if (tag === "br") { out.push({ kind: "blank" }); return; }
  if (tag === "h1" || tag === "h2" || tag === "h3") { out.push({ kind: tag, spans: collectInline(el, ctx), align }); return; }
  if (tag === "ul") {
    elementChildren(el).filter((li) => li.tag === "li").forEach((li) => out.push({ kind: "bullet", spans: collectInline(li, ctx) }));
    return;
  }
  if (tag === "ol") {
    let index = 1;
    elementChildren(el).filter((li) => li.tag === "li").forEach((li) => { out.push({ kind: "ordered", spans: collectInline(li, ctx), index }); index += 1; });
    return;
  }
  if (tag === "img") {
    const width = attr(el, "width") ? parseFloat(attr(el, "width")!) : undefined;
    const height = attr(el, "height") ? parseFloat(attr(el, "height")!) : undefined;
    out.push({ kind: "image", src: attr(el, "src") || "", width, height, align: (attr(el, "data-align") as any) || undefined });
    return;
  }
  if (tag === "p" || tag === "div" || tag === "blockquote" || tag === "pre") {
    const spans = collectInline(el, ctx);
    if (isBlank(spans)) { out.push({ kind: "blank" }); return; }
    out.push({ kind: tag === "div" ? "paragraph" : tag === "p" ? "paragraph" : tag, spans, align } as RichBlock);
    return;
  }
  if (tag === "figure" || hasBlockDescendant(el)) {
    el.children.forEach((child) => visitBlock(child, out, ctx));
    return;
  }
  const spans = collectInline(el, ctx);
  if (spans.length) out.push({ kind: "paragraph", spans });
}

export function richHtmlToBlocks(html: string): RichBlock[] {
  if (!html) return [];
  const root = parseHtmlTree(html);
  const out: RichBlock[] = [];
  for (const child of root.children) visitBlock(child, out, { bold: false, italic: false, underline: false });
  return out;
}

/* ------------------------------------------------------------------ */
/* PDF layout (buildLetterheadPdf, with images supplied by the server). */
/* ------------------------------------------------------------------ */

export type ImageAsset = { dataUrl: string; width: number; height: number; format: "PNG" | "JPEG" };

export type ServerLetterheadPdfInput = {
  title: string;
  bodyHtml: string;
  paperSize: "a4" | "legal";
  lineSpacing?: number;
  bottomMargin: "wide" | "small";
  hasSecondPage: boolean;
  firstBackground: ImageAsset | null;
  secondBackground: ImageAsset | null;
  signature: ImageAsset | null;
  signatureX: number;
  signatureY: number;
  signatureWidth: number;
  signaturePage: "first" | "last";
  stamp: ImageAsset | null;
  stampX: number;
  stampY: number;
  stampWidth: number;
  stampPage: "first" | "last";
  signatures: Array<{ asset: ImageAsset | null; signatureX: number; signatureY: number; signatureWidth: number; signaturePage: "first" | "last"; status: string }>;
  loadBodyImage: (src: string) => Promise<ImageAsset | null>;
};

export async function buildServerLetterheadPdf(options: ServerLetterheadPdfInput) {
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
  const lineSpacing = Math.max(1, Math.min(3, Number(options.lineSpacing) || 1));
  const bodyLineHeight = 6.5 * lineSpacing;
  const paragraphGap = 1.5 * (1 + (lineSpacing - 1) * 0.6);
  const firstBackground = options.firstBackground;
  const secondBackground = options.hasSecondPage ? options.secondBackground : null;

  function drawBackground(pageNumber: number) {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    const background = pageNumber === 1 ? firstBackground : (secondBackground || firstBackground);
    if (background) doc.addImage(background.dataUrl, background.format, 0, 0, pageWidth, pageHeight);
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
    y += height;
  }

  type StyledChar = { ch: string; bold: boolean; italic: boolean; underline: boolean; color?: readonly [number, number, number]; size: number };
  const fontStyle = (char: StyledChar) => (char.bold && char.italic ? "bolditalic" : char.bold ? "bold" : char.italic ? "italic" : "normal");

  function drawRichSpans(
    spans: RichSpan[],
    opts: { size: number; bold?: boolean; lineHeight: number; align?: RichAlignment; indent?: number; color?: readonly [number, number, number]; fontName?: string },
  ) {
    const defaultFontName = (doc as any).getFont?.()?.fontName || "helvetica";
    const fontName = opts.fontName || defaultFontName;
    const chars: StyledChar[] = [];
    for (const span of spans) {
      const parsedColor = span.color ? hexToRgb(span.color) : undefined;
      const color = parsedColor && parsedColor.every(Number.isFinite) ? parsedColor as readonly [number, number, number] : opts.color;
      for (const ch of span.text.replace(/\r\n?/g, "\n").replace(/ /g, " ")) {
        chars.push({ ch, bold: !!span.bold || !!opts.bold, italic: !!span.italic, underline: !!span.underline, color, size: span.fontSize || opts.size });
      }
    }
    const indent = opts.indent || 0;
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
    const flush = () => { lines.push(line); line = []; lastWordBoundary = 0; };
    for (const char of chars) {
      if (char.ch === "\n") { flush(); continue; }
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
      const largestSize = characters.reduce((largest, char) => Math.max(largest, char.size), opts.size);
      const lineHeight = Math.max(opts.lineHeight, largestSize * 0.352778 * 1.35);
      ensureSpace(lineHeight);
      const lineWidth = measure(characters);
      let x = marginX + indent;
      if (opts.align === "center") x += Math.max(0, (usableWidth - lineWidth) / 2);
      if (opts.align === "right") x += Math.max(0, usableWidth - lineWidth);
      const spaces = characters.filter((char) => char.ch === " ").length;
      const justify = opts.align === "justify" && lineIndex < lines.length - 1 && spaces > 0;
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

  for (const block of richHtmlToBlocks(options.bodyHtml || "")) {
    if (block.kind === "blank") { addVerticalSpace(bodyLineHeight); continue; }
    if (block.kind === "hr") {
      ensureSpace(8);
      y += 2.5;
      doc.setDrawColor(200, 205, 215);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 5.5;
      continue;
    }
    if (block.kind === "h1") { addVerticalSpace(4.2); drawRichSpans(block.spans, { size: 21.6, bold: true, lineHeight: 9.4, align: block.align }); addVerticalSpace(2.2); continue; }
    if (block.kind === "h2") { addVerticalSpace(3.8); drawRichSpans(block.spans, { size: 16.8, bold: true, lineHeight: 8, align: block.align }); addVerticalSpace(1.8); continue; }
    if (block.kind === "h3") { addVerticalSpace(3.4); drawRichSpans(block.spans, { size: 13.8, bold: true, lineHeight: 7.2, align: block.align }); addVerticalSpace(1.5); continue; }
    if (block.kind === "bullet") { drawListMarker("•", block.spans, 6); continue; }
    if (block.kind === "ordered") { drawListMarker(`${block.index}.`, block.spans, 8); continue; }
    if (block.kind === "image") {
      const asset = await options.loadBodyImage(block.src);
      if (!asset) continue;
      const width = Math.min(maxWidth, Math.max(20, (block.width || 500) * 0.16));
      const height = width * (asset.height / asset.width);
      ensureSpace(height + 4);
      const x = block.align === "right" ? pageWidth - marginX - width : block.align === "center" ? (pageWidth - width) / 2 : marginX;
      doc.addImage(asset.dataUrl, asset.format, x, y, width, height);
      y += height + 4;
      continue;
    }
    if (block.kind === "blockquote") {
      ensureSpace(bodyLineHeight + 3);
      const quoteY = y - 3.5;
      doc.setDrawColor(10, 79, 232);
      doc.setLineWidth(0.8);
      doc.line(marginX + 1, quoteY, marginX + 1, quoteY + bodyLineHeight + 3);
      drawRichSpans(block.spans, { size: bodySize, lineHeight: bodyLineHeight, align: block.align, indent: 6, color: [75, 85, 105] });
      addVerticalSpace(1.5);
      continue;
    }
    if (block.kind === "pre") {
      addVerticalSpace(1.8);
      drawRichSpans(block.spans, { size: 9.5, lineHeight: 5.8, align: block.align, indent: 4, color: [45, 55, 72], fontName: "courier" });
      addVerticalSpace(2.2);
      continue;
    }
    drawRichSpans(block.spans, { size: bodySize, lineHeight: bodyLineHeight, align: block.align });
    addVerticalSpace(paragraphGap);
  }

  const place = (asset: ImageAsset, page: "first" | "last", xPercent: number, yPercent: number, widthPercent: number) => {
    doc.setPage(page === "first" ? 1 : pageNumber);
    const width = pageWidth * Math.min(80, Math.max(5, widthPercent)) / 100;
    const height = width * asset.height / asset.width;
    const x = Math.min(pageWidth - width, Math.max(0, pageWidth * xPercent / 100));
    const placedY = Math.min(pageHeight - height, Math.max(0, pageHeight * yPercent / 100));
    doc.addImage(asset.dataUrl, asset.format, x, placedY, width, height);
  };
  if (options.signature) place(options.signature, options.signaturePage, options.signatureX, options.signatureY, options.signatureWidth);
  for (const placed of options.signatures) {
    if (!placed.asset || (placed.status !== "ready" && placed.status !== "signed")) continue;
    place(placed.asset, placed.signaturePage, placed.signatureX, placed.signatureY, placed.signatureWidth);
  }
  if (options.stamp) place(options.stamp, options.stampPage, options.stampX, options.stampY, options.stampWidth);

  doc.setProperties({ title: options.title || "Official letterhead", subject: "Corporate letterhead document", author: "CDS Space", creator: "CDS Space cDocs" });
  return doc;
}

/* ------------------------------------------------------------------ */
/* Loading a document's private artwork and producing preview/export.  */
/* ------------------------------------------------------------------ */

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

async function assetFromBuffer(buffer: Buffer): Promise<ImageAsset | null> {
  try {
    const png = await sharp(buffer, { limitInputPixels: 16000 * 16000 }).png().toBuffer();
    const meta = await sharp(png).metadata();
    return { dataUrl: `data:image/png;base64,${png.toString("base64")}`, width: meta.width || 1, height: meta.height || 1, format: "PNG" };
  } catch {
    return null;
  }
}

async function downloadStorage(path: string | null | undefined): Promise<Buffer | null> {
  if (!path) return null;
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage.from(LETTERHEAD_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

const storageAsset = async (path: string | null | undefined) => {
  const buffer = await downloadStorage(path);
  return buffer ? assetFromBuffer(buffer) : null;
};

/** Images written into the letter body: inline data URLs, or public https images (as the browser would load them). */
async function loadBodyImage(src: string): Promise<ImageAsset | null> {
  const data = /^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i.exec(src || "");
  if (data) {
    const buffer = Buffer.from(data[1], "base64");
    return buffer.length <= IMAGE_MAX_BYTES ? assetFromBuffer(buffer) : null;
  }
  let url: URL;
  try { url = new URL(src); } catch { return null; }
  // Only public https hosts by name: never loopback, private ranges or bare IPs.
  if (url.protocol !== "https:" || /^(localhost|\[.*\]|\d+\.\d+\.\d+\.\d+)$/i.test(url.hostname) || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) return null;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length <= IMAGE_MAX_BYTES ? assetFromBuffer(buffer) : null;
  } catch {
    return null;
  }
}

export class LetterheadMobileError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/**
 * The PDF inputs for one of the admin's Executive Board documents. Ownership is
 * enforced by getLetterhead (owner_kind/owner_id), exactly as the web studio's
 * asset routes do; documents from the CREATE workspace are refused.
 */
async function documentPdfInput(actor: CreateActor, id: string, includeSignatures: boolean): Promise<{ input: ServerLetterheadPdfInput; title: string; paperSize: "a4" | "legal"; hasArtwork: boolean }> {
  const letterhead = await getLetterhead(actor, id);
  if (!letterhead || letterhead.scope !== "executive_board") throw new LetterheadMobileError("Letterhead not found.", 404);
  const signatureRows = includeSignatures
    ? await glashQuery<{ id: string; storage_path: string | null }>(
      `select signature.id::text, signature.storage_path
         from public.create_letterhead_signatures signature
         join public.create_letterheads letterhead on letterhead.id = signature.letterhead_id
        where signature.letterhead_id = $3::uuid
          and letterhead.owner_kind = $1 and letterhead.owner_id = $2 and letterhead.deleted_at is null`,
      [actor.kind, actor.id, id],
    )
    : [];
  const pathFor = new Map(signatureRows.map((row) => [row.id, row.storage_path]));
  const ownPath = (path: string | null) => (path && isCreatePrivateAssetPath(actor, path) ? path : null);
  const [firstBackground, secondBackground, signature, stamp, signatures] = await Promise.all([
    storageAsset(ownPath(letterhead.firstPagePath)),
    letterhead.hasSecondPage ? storageAsset(ownPath(letterhead.secondPagePath)) : Promise.resolve(null),
    includeSignatures ? storageAsset(ownPath(letterhead.signaturePath)) : Promise.resolve(null),
    includeSignatures ? storageAsset(ownPath(letterhead.stampPath)) : Promise.resolve(null),
    Promise.all(letterhead.signatures.map(async (placed) => ({
      asset: includeSignatures && placed.signatureUrl ? await storageAsset(ownPath(pathFor.get(placed.id) || null)) : null,
      signatureX: placed.signatureX,
      signatureY: placed.signatureY,
      signatureWidth: placed.signatureWidth,
      signaturePage: placed.signaturePage,
      status: placed.status,
    }))),
  ]);
  return {
    title: letterhead.title,
    paperSize: letterhead.paperSize,
    hasArtwork: Boolean(letterhead.firstPagePath),
    input: {
      title: letterhead.title,
      bodyHtml: letterhead.bodyHtml,
      paperSize: letterhead.paperSize,
      lineSpacing: letterhead.lineSpacing,
      bottomMargin: letterhead.bottomMargin,
      hasSecondPage: letterhead.hasSecondPage,
      firstBackground,
      secondBackground,
      signature,
      signatureX: letterhead.signatureX,
      signatureY: letterhead.signatureY,
      signatureWidth: letterhead.signatureWidth,
      signaturePage: letterhead.signaturePage,
      stamp,
      stampX: letterhead.stampX,
      stampY: letterhead.stampY,
      stampWidth: letterhead.stampWidth,
      stampPage: letterhead.stampPage,
      signatures,
      loadBodyImage,
    },
  };
}

const PREVIEW_PAGE_LIMIT = 40;

async function rasterizePages(pdf: ArrayBuffer, scale: number) {
  const proxy = await getDocumentProxy(new Uint8Array(pdf.slice(0)));
  const count = Math.min(proxy.numPages, PREVIEW_PAGE_LIMIT);
  await proxy.destroy().catch(() => undefined);
  const pages: Buffer[] = [];
  for (let page = 1; page <= count; page += 1) {
    const rendered = await renderPageAsImage(new Uint8Array(pdf.slice(0)), page, { canvasImport: () => import("@napi-rs/canvas"), scale });
    pages.push(Buffer.from(rendered));
  }
  return pages;
}

/**
 * The exact page images the web studio shows in its preview: the document laid
 * out on its stationery, without signatures and seal (the app draws those as
 * movable overlays, like the web).
 */
export async function previewExecutiveBoardLetterhead(actor: CreateActor, id: string) {
  const { input, paperSize } = await documentPdfInput(actor, id, false);
  const doc = await buildServerLetterheadPdf(input);
  const pages = await rasterizePages(doc.output("arraybuffer"), 1.25);
  const images = await Promise.all(pages.map(async (page) => {
    const jpeg = await sharp(page).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  }));
  return { pages: images, pageCount: images.length, paperSize };
}

export type LetterheadExportSize = "original" | "compressed" | "lite";

export function letterheadExportSize(value: unknown): LetterheadExportSize {
  return value === "compressed" || value === "lite" ? value : "original";
}

export function letterheadFileName(title: string, size: LetterheadExportSize) {
  const base = (title || "official-letterhead").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "official-letterhead";
  return `${base}${size === "original" ? "" : `-${size}`}.pdf`;
}

/**
 * Same as the web's optimizedLetterheadPdf: rasterise the exact pages, then
 * re-encode them as JPEG, lowering quality and dimensions until the copy is at
 * least 50% (compressed) or 25% (lite) smaller than the original.
 */
async function optimizedLetterheadPdf(source: ArrayBuffer, paperSize: "a4" | "legal", size: Exclude<LetterheadExportSize, "original">) {
  const targetBytes = Math.max(1, Math.floor(source.byteLength * (size === "compressed" ? 0.5 : 0.75)));
  const pages = await rasterizePages(source, size === "compressed" ? 1.35 : 1.7);
  const metas = await Promise.all(pages.map((page) => sharp(page).metadata()));
  const format: [number, number] = paperSize === "legal" ? [215.9, 355.6] : [210, 297];
  const initialQuality = size === "compressed" ? 0.72 : 0.86;
  const initialScale = size === "compressed" ? 0.82 : 1;
  let best = source;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const scale = Math.max(0.12, initialScale * Math.pow(0.78, attempt));
    const quality = Math.max(0.16, initialQuality * Math.pow(0.82, attempt));
    const output = new jsPDF({ orientation: "portrait", unit: "mm", format, compress: true });
    for (let index = 0; index < pages.length; index += 1) {
      if (index > 0) output.addPage(format, "portrait");
      const meta = metas[index];
      let pipeline = sharp(pages[index]).flatten({ background: "#ffffff" });
      if (scale < 0.995 && meta.width && meta.height) {
        pipeline = pipeline.resize(Math.max(1, Math.round(meta.width * scale)), Math.max(1, Math.round(meta.height * scale)));
      }
      const jpeg = await pipeline.jpeg({ quality: Math.round(quality * 100) }).toBuffer();
      output.addImage(`data:image/jpeg;base64,${jpeg.toString("base64")}`, "JPEG", 0, 0, format[0], format[1], undefined, "FAST");
    }
    const candidate = output.output("arraybuffer");
    if (candidate.byteLength < best.byteLength) best = candidate;
    if (candidate.byteLength <= targetBytes) return candidate;
  }
  return best;
}

/** The downloadable PDF, with signatures, additional signers and seal placed. */
export async function exportExecutiveBoardLetterhead(actor: CreateActor, id: string, size: LetterheadExportSize) {
  const { input, title, paperSize, hasArtwork } = await documentPdfInput(actor, id, true);
  if (!hasArtwork) throw new LetterheadMobileError("Upload the first-page letterhead design before exporting.", 400);
  const original = (await buildServerLetterheadPdf(input)).output("arraybuffer");
  const data = size === "original" ? original : await optimizedLetterheadPdf(original, paperSize, size);
  return { data, originalBytes: original.byteLength, fileName: letterheadFileName(title, size) };
}
