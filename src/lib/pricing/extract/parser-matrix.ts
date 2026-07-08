/**
 * Best-effort deterministic parser for tabular price PDFs. Used as a fallback
 * when the AI matrix extractor isn't available. It recovers rows (a short
 * label followed by 2+ price / "Quote required" cells) and, where possible,
 * the variant (column) names from a header line - otherwise generic names the
 * admin can rename.
 */
import {
    detectCurrency,
    slugify,
    type CurrencyCode,
    type MatrixData,
    type PricingListData,
} from "../types";

export interface MatrixParseResult {
    data: Partial<PricingListData>;
    currency: CurrencyCode | null;
    confidence: number;
}

const CELL_RE = /(?:NGN|USD|RWF)\s*[\d,]+|Quote required/gi;
const VARIANT_HINTS = ["matte", "gloss", "satin", "glitter", "crystal", "frameless", "finish", "premium", "standard", "canvas", "acrylic", "wood", "metal"];

function normalize(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

/** Try to read variant names from a header line above the first data row. */
function detectVariants(lines: string[], firstRowIdx: number, count: number): string[] {
    for (let i = firstRowIdx - 1; i >= 0 && i >= firstRowIdx - 4; i--) {
        const line = lines[i];
        const low = line.toLowerCase();
        const hits = VARIANT_HINTS.filter((h) => low.includes(h)).length;
        if (hits >= 1) {
            // Split off a leading "Size (Inches)"-style row label, then split the
            // rest on 2+ spaces or " / "-safe separators.
            const parts = line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
            const tail = parts.length > count ? parts.slice(parts.length - count) : parts;
            if (tail.length === count) return tail;
        }
    }
    return Array.from({ length: count }, (_, i) => `Option ${i + 1}`);
}

export function parseMatrixPdf(text: string): MatrixParseResult {
    const lines = normalize(text);
    const currency = detectCurrency(text);

    const rowsRaw: { idx: number; label: string; tokens: string[] }[] = [];
    lines.forEach((line, idx) => {
        const tokens = line.match(CELL_RE);
        if (!tokens || tokens.length < 2) return;
        const firstIdx = line.search(CELL_RE);
        const label = line.slice(0, firstIdx).trim();
        if (label && label.length <= 24) rowsRaw.push({ idx, label, tokens });
    });

    const count = rowsRaw.reduce((m, r) => Math.max(m, r.tokens.length), 0);
    const variantNames =
        rowsRaw.length && count ? detectVariants(lines, rowsRaw[0].idx, count) : [];
    const variants = variantNames.map((name) => ({ id: slugify(name) || name, name }));

    const cur = currency ?? "ngn";
    const rows = rowsRaw.map((r) => {
        const cells: MatrixData["rows"][number]["cells"] = {};
        r.tokens.forEach((tok, i) => {
            const vid = variants[i]?.id;
            if (!vid) return;
            if (/quote required/i.test(tok)) cells[vid] = { amounts: {}, note: "Quote required" };
            else {
                const amount = (tok.match(/[\d,]+/)?.[0] || "").trim();
                cells[vid] = { amounts: { [cur]: amount } };
            }
        });
        return { label: r.label, cells };
    });

    const title =
        text.match(/^([A-Z][^\n]{4,70}(?:Pricing|Price List))/m)?.[1]?.trim() || "Pricing";

    const matrix: MatrixData = { rowLabel: "Item", variants, rows, notes: [] };
    const data: Partial<PricingListData> = {
        kind: "matrix",
        title,
        matrix,
        currencyMeta: currency ? { [currency]: { market: "", note: "" } } : undefined,
    };

    let confidence = 0;
    if (currency) confidence += 0.15;
    if (rows.length >= 5) confidence += 0.5;
    else if (rows.length >= 2) confidence += 0.25;
    if (variantNames.length && !variantNames[0].startsWith("Option")) confidence += 0.2;

    return { data, currency, confidence: Math.min(1, confidence) };
}
