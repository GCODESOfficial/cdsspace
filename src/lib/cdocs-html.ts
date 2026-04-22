/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * HTML utilities for cDocs.
 *
 * The rich editor stores its body as HTML (contentEditable output).
 * This module:
 *   - detects HTML vs legacy markdown-lite bodies (`isHtmlBody`)
 *   - sanitizes HTML for public display (allowlist of tags/attrs)
 *   - parses HTML into a structured block list the PDF exporter can render
 */

export type RichSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;     // "#rrggbb"
  fontSize?: number;  // pt
};

export type RichBlock =
  | { kind: "h1"; spans: RichSpan[]; align?: "left" | "center" | "right" }
  | { kind: "h2"; spans: RichSpan[]; align?: "left" | "center" | "right" }
  | { kind: "paragraph"; spans: RichSpan[]; align?: "left" | "center" | "right" }
  | { kind: "bullet"; spans: RichSpan[] }
  | { kind: "ordered"; spans: RichSpan[]; index: number }
  | { kind: "image"; src: string; width?: number; height?: number; align?: "left" | "center" | "right" }
  | { kind: "hr" }
  | { kind: "blank" };

export function isHtmlBody(body: string): boolean {
  if (!body) return false;
  return /^\s*<(h1|h2|h3|p|div|ul|ol|li|img|strong|b|em|i|u|span|hr|figure|blockquote)\b/i.test(body);
}

const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "p", "div", "br", "hr",
  "ul", "ol", "li",
  "strong", "b", "em", "i", "u",
  "span", "font", "a", "img", "figure", "figcaption", "blockquote",
]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  "*": new Set(["style", "align", "data-align"]),
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "data-align"]),
  span: new Set(["style"]),
  font: new Set(["color"]),
};

/**
 * Very conservative sanitizer suitable for an already-trusted team editor.
 * Strips <script>, event handlers, and javascript: URLs. Does NOT parse CSS
 * in depth — only keeps `style` on known tags.
 */
export function sanitizeCDocHtml(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html; // server passthrough; rendered client-side
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstChild as HTMLElement | null;
  if (!root) return "";

  function walk(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return node;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Replace unknown tags with their contents
      const frag = doc.createDocumentFragment();
      Array.from(el.childNodes).forEach((c) => {
        const w = walk(c);
        if (w) frag.appendChild(w);
      });
      return frag;
    }
    // Strip event handlers + javascript: hrefs
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) { el.removeAttribute(attr.name); continue; }
      const allowed = ALLOWED_ATTRS[tag] || ALLOWED_ATTRS["*"];
      const globalOk = ALLOWED_ATTRS["*"].has(name);
      if (!allowed?.has(name) && !globalOk) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" || name === "src") {
        const v = attr.value.trim().toLowerCase();
        if (v.startsWith("javascript:") || v.startsWith("data:text/html")) {
          el.removeAttribute(attr.name);
        }
      }
    }
    // Recurse
    Array.from(el.childNodes).forEach((c) => {
      const w = walk(c);
      if (!w) el.removeChild(c);
      else if (w !== c) el.replaceChild(w, c);
    });
    return el;
  }

  walk(root);
  return root.innerHTML;
}

/**
 * Walk the HTML into a structured block list. Keeps alignment, colors,
 * bold/italic/underline, images, lists, and headings.
 */
export function parseRichHtmlToBlocks(html: string): RichBlock[] {
  if (!html) return [];
  if (typeof window === "undefined") {
    // Server-side fallback: treat as one paragraph so PDF exports still work.
    // (The exporter runs client-side anyway.)
    return [{ kind: "paragraph", spans: [{ text: stripTags(html) }] }];
  }
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html");
  const root = doc.getElementById("__root");
  const out: RichBlock[] = [];
  if (!root) return out;

  for (const child of Array.from(root.childNodes)) {
    visitBlock(child, out, { bold: false, italic: false, underline: false });
  }
  return out;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

type InlineCtx = { bold: boolean; italic: boolean; underline: boolean; color?: string };

function visitBlock(node: Node, out: RichBlock[], ctx: InlineCtx) {
  if (node.nodeType === Node.TEXT_NODE) {
    const txt = (node.textContent || "").replace(/\u00a0/g, " ");
    if (txt.trim()) {
      out.push({ kind: "paragraph", spans: [{ text: txt, ...styleOf(ctx) }] });
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const style = el.getAttribute("style") || "";
  const align = pickAlign(style, el.getAttribute("align"));

  if (tag === "hr") { out.push({ kind: "hr" }); return; }
  if (tag === "br") { out.push({ kind: "blank" }); return; }

  if (tag === "h1" || tag === "h2" || tag === "h3") {
    const spans = collectInline(el, ctx);
    out.push({ kind: tag === "h1" ? "h1" : "h2", spans, align });
    return;
  }

  if (tag === "ul") {
    Array.from(el.children).forEach((li) => {
      if ((li as HTMLElement).tagName.toLowerCase() === "li") {
        out.push({ kind: "bullet", spans: collectInline(li as HTMLElement, ctx) });
      }
    });
    return;
  }

  if (tag === "ol") {
    let index = 1;
    Array.from(el.children).forEach((li) => {
      if ((li as HTMLElement).tagName.toLowerCase() === "li") {
        out.push({ kind: "ordered", spans: collectInline(li as HTMLElement, ctx), index });
        index++;
      }
    });
    return;
  }

  if (tag === "img") {
    const src = el.getAttribute("src") || "";
    const width = el.getAttribute("width") ? parseFloat(el.getAttribute("width")!) : undefined;
    const height = el.getAttribute("height") ? parseFloat(el.getAttribute("height")!) : undefined;
    const a = (el.getAttribute("data-align") as any) || undefined;
    out.push({ kind: "image", src, width, height, align: a });
    return;
  }

  if (tag === "p" || tag === "div") {
    const spans = collectInline(el, ctx);
    if (spans.length === 0) { out.push({ kind: "blank" }); return; }
    out.push({ kind: "paragraph", spans, align });
    return;
  }

  if (tag === "figure" || tag === "blockquote") {
    // Dive into children
    Array.from(el.childNodes).forEach((c) => visitBlock(c, out, ctx));
    return;
  }

  // Inline-level tag at the block root — wrap as a paragraph
  const spans = collectInline(el, ctx);
  if (spans.length) out.push({ kind: "paragraph", spans });
}

function collectInline(el: HTMLElement, ctx: InlineCtx): RichSpan[] {
  const out: RichSpan[] = [];
  const push = (s: RichSpan) => {
    const last = out[out.length - 1];
    if (last && sameStyle(last, s)) last.text += s.text;
    else if (s.text) out.push(s);
  };
  for (const child of Array.from(el.childNodes)) {
    collect(child, ctx, push);
  }
  return out;
}

function sameStyle(a: RichSpan, b: RichSpan) {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && (a.color || "") === (b.color || "");
}

function collect(node: Node, ctx: InlineCtx, push: (s: RichSpan) => void) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent || "").replace(/\u00a0/g, " ");
    if (t) push({ text: t, ...styleOf(ctx) });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const nextCtx: InlineCtx = { ...ctx };
  if (tag === "strong" || tag === "b") nextCtx.bold = true;
  if (tag === "em" || tag === "i") nextCtx.italic = true;
  if (tag === "u") nextCtx.underline = true;
  const style = el.getAttribute("style") || "";
  const inlineColor = pickColor(style) || el.getAttribute("color") || ctx.color;
  if (inlineColor) nextCtx.color = inlineColor;
  if (style.includes("font-weight")) {
    if (/font-weight\s*:\s*(700|bold)/.test(style)) nextCtx.bold = true;
  }
  if (style.includes("font-style: italic")) nextCtx.italic = true;
  if (style.includes("text-decoration") && /underline/.test(style)) nextCtx.underline = true;
  if (tag === "br") { push({ text: "\n", ...styleOf(nextCtx) }); return; }
  for (const child of Array.from(el.childNodes)) collect(child, nextCtx, push);
}

function styleOf(ctx: InlineCtx): Partial<RichSpan> {
  const s: Partial<RichSpan> = {};
  if (ctx.bold) s.bold = true;
  if (ctx.italic) s.italic = true;
  if (ctx.underline) s.underline = true;
  if (ctx.color) s.color = normalizeColor(ctx.color);
  return s;
}

function pickAlign(style: string, fallback: string | null): "left" | "center" | "right" | undefined {
  const m = style.match(/text-align\s*:\s*(left|center|right)/i);
  if (m) return m[1].toLowerCase() as any;
  if (fallback === "center" || fallback === "right" || fallback === "left") return fallback;
  return undefined;
}

function pickColor(style: string): string | undefined {
  const m = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  return m ? m[1].trim() : undefined;
}

function normalizeColor(c: string): string {
  if (!c) return "#000000";
  if (c.startsWith("#")) return c.length === 4
    ? "#" + c.slice(1).split("").map((x) => x + x).join("")
    : c;
  const m = c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const to = (n: string) => parseInt(n, 10).toString(16).padStart(2, "0");
    return `#${to(m[1])}${to(m[2])}${to(m[3])}`;
  }
  return c;
}

/** Hex to rgb tuple. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
