/* eslint-disable @typescript-eslint/no-explicit-any */
import type jsPDF from "jspdf";
import { NEUE_CAMPTON_TTF_B64, NEUE_CAMPTON_CODEPOINTS } from "./neue-campton-font";

/** The brand font family name registered into every PDF document. */
export const BRAND_FONT = "NeueCampton";

const STYLES = ["normal", "bold", "italic", "bolditalic"] as const;
const SUPPORTED = new Set(NEUE_CAMPTON_CODEPOINTS);
const WHITESPACE = new Set([9, 10, 13, 32]);

/** True when every non-space glyph in `text` exists in the (trial) font. */
function allSupported(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || WHITESPACE.has(cp)) continue;
    if (!SUPPORTED.has(cp)) return false;
  }
  return true;
}

/**
 * Characters Helvetica (WinAnsi) cannot encode, rewritten to ones it can.
 * Currency signs become their ISO code so the amount still says what it is.
 */
const WINANSI_REPLACEMENTS: Array<[RegExp, string]> = [
  [/₦\s?/g, "NGN "],
  [/₵\s?/g, "GHS "],
  [/₹\s?/g, "INR "],
  [/[   ]/g, " "], // no-break, figure and narrow spaces from Intl
  [/[‐-‒−]/g, "-"], // hyphen variants and the minus sign
];

/** Applies WINANSI_REPLACEMENTS to a string or each line of a string array. */
export function winAnsiSafe<T extends string | string[]>(text: T): T {
  const fix = (value: string) => WINANSI_REPLACEMENTS.reduce((out, [pattern, to]) => out.replace(pattern, to), value);
  return (Array.isArray(text) ? text.map((line) => fix(String(line ?? ""))) : fix(String(text ?? ""))) as T;
}

/**
 * Register Neue Campton (normal/bold/italic/bolditalic) on a jsPDF document and
 * make it the default font. Because the current trial font is a 66-glyph subset
 * (no ₦/$/%/apostrophes/…), this also wraps `text()` and `getTextWidth()` so any
 * string containing an unsupported glyph is drawn/measured with the built-in
 * Helvetica instead - so nothing ever prints as a blank ☐ box. Callers keep
 * setting fonts with `doc.setFont("NeueCampton", style)`.
 *
 * With the FULL licensed font (complete glyph coverage) the fallback simply
 * never triggers and every string renders in Neue Campton.
 */
export function installBrandFont(doc: jsPDF) {
  const d = doc as any;

  for (const style of STYLES) {
    const file = `NeueCampton-${style}.ttf`;
    d.addFileToVFS(file, NEUE_CAMPTON_TTF_B64[style]);
    d.addFont(file, BRAND_FONT, style);
  }

  const applyFor = (str: string, style: string) => {
    const st = (STYLES as readonly string[]).includes(style) ? style : "normal";
    d.setFont(allSupported(str) ? BRAND_FONT : "helvetica", st);
  };

  const origText = d.text.bind(d);
  d.text = (text: any, ...rest: any[]) => {
    const cur = d.getFont?.();
    if (cur?.fontName === BRAND_FONT) {
      const style = cur.fontStyle || "normal";
      const str = Array.isArray(text) ? text.join("\n") : String(text ?? "");
      applyFor(str, style);
      // Helvetica is WinAnsi-only; a single character outside it (₦, a narrow
      // space from Intl) makes jsPDF print the whole string as spaced-out
      // UTF-16. Rewrite those characters before they reach the fallback font.
      const safe = allSupported(str) ? text : winAnsiSafe(text);
      const out = origText(safe, ...rest);
      d.setFont(BRAND_FONT, style); // restore the caller's intent
      return out;
    }
    return origText(text, ...rest);
  };

  // Line wrapping measures the same characters it will later draw, so it has
  // to see the rewritten text or a wrapped ₦ line would be measured short.
  if (typeof d.splitTextToSize === "function") {
    const origSplit = d.splitTextToSize.bind(d);
    d.splitTextToSize = (text: any, ...rest: any[]) => {
      const str = Array.isArray(text) ? text.join("\n") : String(text ?? "");
      return origSplit(allSupported(str) ? text : winAnsiSafe(text), ...rest);
    };
  }

  if (typeof d.getTextWidth === "function") {
    const origWidth = d.getTextWidth.bind(d);
    d.getTextWidth = (text: any) => {
      const cur = d.getFont?.();
      if (cur?.fontName === BRAND_FONT) {
        const style = cur.fontStyle || "normal";
        applyFor(String(text ?? ""), style);
        const w = origWidth(text);
        d.setFont(BRAND_FONT, style);
        return w;
      }
      return origWidth(text);
    };
  }

  doc.setFont(BRAND_FONT, "normal");
}
