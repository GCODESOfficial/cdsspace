"use client";

// Translate the STATIC labels of a client-side (jsPDF) document into the
// active language, so a downloaded invoice/receipt/quotation comes out in the
// language the visitor picked. Only known labels are translated - dynamic data
// (names, amounts, dates, item text) passes through untouched.

/** The language the visitor selected in the accessibility widget. */
export function activeLang(): string {
  try {
    return localStorage.getItem("cds.lang") || "en";
  } catch {
    return "en";
  }
}

/** Translate a fixed set of labels once; returns an {original -> translated} map. */
export async function buildLabelMap(labels: string[], lang: string): Promise<Record<string, string>> {
  if (lang === "en" || labels.length === 0) return {};
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: labels, source: "en", target: lang }),
    });
    if (!res.ok) return {};
    const { translations } = await res.json();
    const map: Record<string, string> = {};
    labels.forEach((label, i) => {
      const t = translations?.[i];
      if (typeof t === "string" && t && t !== label) map[label] = t;
    });
    return map;
  } catch {
    return {};
  }
}

/**
 * Wrap jsPDF's `doc.text` so any first-arg string present in `map` is drawn
 * translated. Everything else (dynamic values) is drawn as-is.
 */
export function patchDocText(doc: { text: (...args: unknown[]) => unknown }, map: Record<string, string>) {
  if (!map || Object.keys(map).length === 0) return;
  const original = doc.text.bind(doc);
  doc.text = (...args: unknown[]) => {
    if (typeof args[0] === "string" && map[args[0]]) args[0] = map[args[0]];
    return original(...args);
  };
}

/**
 * Convenience: read active lang, translate the labels and patch the doc.
 * No-op (and no network) when the active language is English.
 */
export async function localizePdfLabels(doc: { text: (...args: unknown[]) => unknown }, labels: string[]) {
  const lang = activeLang();
  if (lang === "en") return;
  const map = await buildLabelMap(labels, lang);
  patchDocText(doc, map);
}
