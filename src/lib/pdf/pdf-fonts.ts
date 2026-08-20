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
      const out = origText(text, ...rest);
      d.setFont(BRAND_FONT, style); // restore the caller's intent
      return out;
    }
    return origText(text, ...rest);
  };

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
