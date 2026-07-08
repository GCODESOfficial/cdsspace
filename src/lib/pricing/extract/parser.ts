/**
 * Deterministic template parser for CDS Space "Brand Identity Pricing" PDFs.
 *
 * This is the free, primary extraction path. It targets the document's known
 * textual patterns (detailed package headers like "Logo Identity Starter |
 * NGN 230,000", the Best for / Timeline / Revision / Key deliverables / Not
 * included labels, the Optional Add-ons list, and the Terms table). It reports
 * a confidence score; the orchestrator falls back to AI when confidence is low
 * or the source PDF's structure differs from this template.
 */
import {
    CURRENCIES,
    detectCurrency,
    slugify,
    type AddOn,
    type CurrencyCode,
    type PricingListData,
    type PricingPackage,
} from "../types";

export interface ParseResult {
    data: Partial<PricingListData>;
    currency: CurrencyCode | null;
    confidence: number; // 0..1
}

const CUR_TOKENS = "NGN|USD|RWF";
const PRICE_RE = new RegExp(`(From\\s+)?(?:${CUR_TOKENS})\\s+([\\d,]+)`, "i");
// A detailed-scope package header: "<Name> | NGN 230,000" or "... | From NGN 3,200,000"
const HEADER_RE = new RegExp(
    `^(.{3,70}?)\\s*\\|\\s*(From\\s+)?(${CUR_TOKENS})\\s+([\\d,]+)\\s*$`,
    "i",
);

const FIELD_LABELS = ["best for", "timeline", "revision"];
const KNOWN_ADDON_HINTS = [
    "brand strategy session",
    "brand naming",
    "brand audit",
    "company profile",
    "product or service catalogue",
    "social media design kit",
    "motion logo",
    "packaging label",
    "signage and wayfinding",
    "website ui",
    "website development",
    "print production",
    "creative support retainer",
    "rush delivery",
];

const TERM_LABELS = [
    "Payment structure",
    "Project start",
    "Revision rule",
    "Final files",
    "Validity",
    "Exclusions",
    "Production support",
    "Refunds and cancellation",
];

function clean(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

function normalizeLines(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((l) => l.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim())
        .filter(Boolean);
}

/** Slice `lines` between the first line matching `start` and the first later line matching `end`. */
function section(lines: string[], startRe: RegExp, endRe?: RegExp): string[] {
    const startIdx = lines.findIndex((l) => startRe.test(l));
    if (startIdx === -1) return [];
    const rest = lines.slice(startIdx + 1);
    if (!endRe) return rest;
    const endIdx = rest.findIndex((l) => endRe.test(l));
    return endIdx === -1 ? rest : rest.slice(0, endIdx);
}

function priceFrom(match: RegExpMatchArray | null, currency: CurrencyCode) {
    if (!match) return undefined;
    const from = /from/i.test(match[1] || match[2] || "");
    const amount = (match[match.length - 1] || "").trim();
    if (!amount) return undefined;
    return { from, amounts: { [currency]: amount } as Partial<Record<CurrencyCode, string>> };
}

export function parsePricingPdf(text: string): ParseResult {
    const lines = normalizeLines(text);
    const joined = lines.join("\n");
    const currency = detectCurrency(text);

    // ---- Meta ----
    const title =
        (joined.match(/Professional Brand Identity Pricing/i)?.[0]) ||
        (joined.match(/^([A-Z][^\n]{6,70}Pricing)$/m)?.[1]) ||
        "Pricing";
    const effectiveDate =
        joined.match(/Effective(?:\s+date)?\s+([A-Za-z]+ \d{1,2},?\s*\d{4})/i)?.[1] ??
        joined.match(/\b([A-Z][a-z]+ \d{1,2},?\s*\d{4})\b/)?.[1] ??
        "";
    const email = joined.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
    const website = joined.match(/\b([a-z0-9-]+\.(?:pro|com|io|co|ng|rw))\b/i)?.[1] ?? "";
    const marketLine =
        joined.match(/([A-Za-z ]+Market)\s*\|\s*([A-Za-z ()]+)/)?.[0] ?? "";

    const contextNote =
        section(lines, /Client-facing note/i, /Packages at a Glance|Detailed Package Scope/i)
            .join(" ")
            .trim() || "";

    // ---- Packages (from the Detailed Package Scope section) ----
    const detail = section(lines, /Detailed Package Scope/i, /Optional Add-?ons/i);
    const scope = detail.length ? detail : lines;

    // Header indices within the scope slice.
    const headerIdxs: number[] = [];
    scope.forEach((l, i) => {
        if (HEADER_RE.test(l)) headerIdxs.push(i);
    });

    const packages: PricingPackage[] = [];
    for (let h = 0; h < headerIdxs.length; h++) {
        const start = headerIdxs[h];
        const end = h + 1 < headerIdxs.length ? headerIdxs[h + 1] : scope.length;
        const block = scope.slice(start, end);
        const m = block[0].match(HEADER_RE);
        if (!m || !currency) continue;
        const name = clean(m[1]);
        const price = priceFrom(m, currency);
        if (!price) continue;

        const getField = (label: string) => {
            const re = new RegExp(`^${label}\\b[:\\s]*(.*)$`, "i");
            for (const line of block.slice(1)) {
                const fm = line.match(re);
                if (fm) return clean(fm[1] || "");
            }
            return "";
        };
        const bestFor = getField("Best for");
        const timeline = getField("Timeline");
        const revision = getField("Revision");

        const deliverables: string[] = [];
        let inDeliv = false;
        let notIncluded = "";
        for (const line of block.slice(1)) {
            if (/^Key deliverables\b/i.test(line)) { inDeliv = true; continue; }
            const notM = line.match(/^Not included:?\s*(.*)$/i);
            if (notM) { notIncluded = clean(notM[1]); inDeliv = false; continue; }
            if (inDeliv) {
                const b = line.match(/^[-•*]\s*(.+)$/);
                if (b) deliverables.push(clean(b[1]));
                else if (FIELD_LABELS.some((f) => new RegExp(`^${f}\\b`, "i").test(line))) continue;
            }
        }

        packages.push({
            id: slugify(name),
            name,
            tagline: "",
            price,
            bestFor,
            timeline,
            revision,
            deliverables,
            notIncluded,
        });
    }

    // ---- Add-ons ----
    const addonLines = section(lines, /Optional Add-?ons/i, /Delivery Process/i);
    const addOns: AddOn[] = [];
    for (const line of addonLines) {
        // "Brand strategy session NGN 250,000" or policy rows.
        const priceMatch = line.match(PRICE_RE);
        const isPercent = /%|per month|project fee/i.test(line);
        if (!priceMatch && !isPercent) continue;
        if (!currency) continue;
        // Name = line with the trailing price/policy stripped.
        let name = line;
        if (priceMatch) name = line.slice(0, priceMatch.index).trim();
        name = name.replace(/\s{2,}.*$/, "").trim();
        const looksLikeAddon =
            KNOWN_ADDON_HINTS.some((h) => line.toLowerCase().includes(h)) || name.length >= 6;
        if (!name || !looksLikeAddon) continue;
        if (isPercent && !priceMatch) {
            addOns.push({ name, text: { [currency]: clean(line.slice(name.length)) } });
        } else if (priceMatch) {
            const from = /from/i.test(priceMatch[1] || "");
            addOns.push({ name, price: { from, amounts: { [currency]: priceMatch[2] } } });
        }
    }

    // ---- Terms ----
    const termLines = section(lines, /Payment, Terms, and Scope Boundaries/i, /Next Step/i);
    const terms = TERM_LABELS.map((label) => {
        const idx = termLines.findIndex((l) => new RegExp(`^${label}\\b`, "i").test(l));
        if (idx === -1) return null;
        // detail = the label line remainder + following lines until the next label
        const first = termLines[idx].replace(new RegExp(`^${label}\\b[:\\s]*`, "i"), "");
        const detailParts = [first];
        for (let i = idx + 1; i < termLines.length; i++) {
            if (TERM_LABELS.some((t) => new RegExp(`^${t}\\b`, "i").test(termLines[i]))) break;
            detailParts.push(termLines[i]);
        }
        const detail = clean(detailParts.join(" "));
        return detail ? { label, detail } : null;
    }).filter(Boolean) as { label: string; detail: string }[];

    // ---- Confidence ----
    const withPrice = packages.filter((p) => p.price?.amounts && Object.keys(p.price.amounts).length);
    const withDeliv = packages.filter((p) => p.deliverables.length >= 2);
    let confidence = 0;
    if (currency) confidence += 0.15;
    if (packages.length >= 4) confidence += 0.3;
    else if (packages.length >= 2) confidence += 0.15;
    if (withPrice.length >= 4) confidence += 0.25;
    if (withDeliv.length >= 3) confidence += 0.2;
    if (addOns.length >= 5) confidence += 0.1;
    confidence = Math.min(1, confidence);

    const market =
        marketLine ? clean(marketLine.split("|")[0]) : currency ? CURRENCIES[currency].market : "";

    const data: Partial<PricingListData> = {
        title: clean(title),
        subtitle: "",
        effectiveDate,
        email,
        website: website || "cdsspace.pro",
        tagline: "Best attracts Best",
        contextNote,
        packages,
        addOns,
        terms,
        currencyMeta: currency ? { [currency]: { market, note: "" } } : undefined,
    };

    return { data, currency, confidence };
}
