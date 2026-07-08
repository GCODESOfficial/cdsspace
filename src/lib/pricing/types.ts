/**
 * Pricing schema - shared by the admin pricelist manager, the client-facing
 * /pricing pages, the PDF extractor, and the OG card.
 *
 * A pricelist is currency-agnostic: every money value is an `amounts` map
 * keyed by currency code, so the same list can carry NGN, USD and RWF at
 * once (populated by uploading one PDF per currency). The client page shows
 * a toggle across whichever currencies are present.
 */

export type CurrencyCode = "ngn" | "usd" | "rwf";

export const CURRENCY_ORDER: CurrencyCode[] = ["ngn", "usd", "rwf"];

export interface CurrencyRegistryEntry {
    code: CurrencyCode;
    /** Prefix shown before an amount, e.g. "NGN". */
    symbol: string;
    /** Full currency name. */
    name: string;
    /** Default market line (overridable per-list). */
    market: string;
    /** Flag emoji for the toggle. */
    flag: string;
}

/** Global currency registry - the display constants that never change. */
export const CURRENCIES: Record<CurrencyCode, CurrencyRegistryEntry> = {
    ngn: { code: "ngn", symbol: "NGN", name: "Nigerian Naira", market: "Nigeria Market", flag: "🇳🇬" },
    usd: { code: "usd", symbol: "USD", name: "United States Dollar", market: "International Market", flag: "🌍" },
    rwf: { code: "rwf", symbol: "RWF", name: "Rwandan Franc", market: "Rwanda Market", flag: "🇷🇼" },
};

export function normalizeCurrency(input?: string | null): CurrencyCode {
    const c = (input || "").toLowerCase();
    return c === "usd" || c === "rwf" ? c : "ngn";
}

/** Detect the currency of a PDF/text blob by its currency tokens. */
export function detectCurrency(text: string): CurrencyCode | null {
    const counts: Record<CurrencyCode, number> = { ngn: 0, usd: 0, rwf: 0 };
    counts.ngn = (text.match(/\bNGN\b|₦|Naira/gi) || []).length;
    counts.usd = (text.match(/\bUSD\b|\bUnited States Dollar\b/gi) || []).length;
    counts.rwf = (text.match(/\bRWF\b|Rwandan Franc/gi) || []).length;
    const best = (Object.entries(counts) as [CurrencyCode, number][])
        .sort((a, b) => b[1] - a[1])[0];
    return best && best[1] > 0 ? best[0] : null;
}

/** A price: `from` marks "From X" pricing; `amounts` holds present currencies. */
export interface Price {
    from?: boolean;
    amounts: Partial<Record<CurrencyCode, string>>;
}

/** Render a price for a currency, e.g. "From NGN 3,200,000". Falls back to em dash. */
export function formatPrice(price: Price | undefined, currency: CurrencyCode): string {
    const amount = price?.amounts?.[currency];
    if (!amount) return "-";
    return `${price?.from ? "From " : ""}${CURRENCIES[currency].symbol} ${amount}`;
}

export interface PricingPackage {
    id: string;
    name: string;
    tagline: string;
    price: Price;
    bestFor: string;
    timeline: string;
    revision: string;
    popular?: boolean;
    deliverables: string[];
    notIncluded: string;
}

export interface RecommendedPath {
    when: string;
    choose: string;
}

/** Add-on row. Either a per-currency `price` or a policy `text` map. */
export interface AddOn {
    name: string;
    price?: Price;
    text?: Partial<Record<CurrencyCode, string>>;
}

export function formatAddOn(addon: AddOn, currency: CurrencyCode): string {
    if (addon.text) return addon.text[currency] ?? "-";
    if (addon.price) return formatPrice(addon.price, currency);
    return "-";
}

export interface ProcessStep {
    title: string;
    detail: string;
}

export interface TermRow {
    label: string;
    detail: string;
}

/** Per-list, per-currency copy pulled from the source document. */
export interface CurrencyOverride {
    market?: string;
    note?: string;
}

/**
 * Pricelist template kind:
 *  - "packages" - the original card-based Brand Identity template.
 *  - "matrix"   - a table where the client toggles a variant (material/finish)
 *                 and reads prices per row (e.g. size). Used for production
 *                 pricing like picture frames.
 */
export type PricingListKind = "packages" | "matrix";

/** A column in the matrix - the thing the client toggles (e.g. "Matte Finish"). */
export interface MatrixVariant {
    id: string;
    name: string;
}

/** A single price cell. `note` (e.g. "Quote required") wins over amounts. */
export interface MatrixCell {
    amounts: Partial<Record<CurrencyCode, string>>;
    note?: string;
}

/** A row in the matrix (e.g. a size), with one cell per variant id. */
export interface MatrixRow {
    label: string;
    cells: Record<string, MatrixCell>;
}

export interface MatrixData {
    /** Header for the row column, e.g. "Size (Inches)". */
    rowLabel: string;
    variants: MatrixVariant[];
    rows: MatrixRow[];
    /** Footnotes shown under the table. */
    notes: string[];
}

/** A complete pricelist - one row in the `pricing_lists` table. */
export interface PricingListData {
    id: string;
    slug: string;
    title: string;
    subtitle: string;
    /** Template kind (defaults to "packages" when absent). */
    kind?: PricingListKind;
    /** Currencies present, in display order. */
    currencies: CurrencyCode[];
    /** Optional per-currency market/note overrides from the source PDFs. */
    currencyMeta?: Partial<Record<CurrencyCode, CurrencyOverride>>;
    preparedBy: string;
    website: string;
    email: string;
    effectiveDate: string;
    tagline: string;
    contextNote: string;
    packages: PricingPackage[];
    /** Present when kind === "matrix". */
    matrix?: MatrixData;
    recommendedPaths: RecommendedPath[];
    addOns: AddOn[];
    deliveryProcess: ProcessStep[];
    terms: TermRow[];
    /** When true, USD/RWF are auto-derived from NGN in the editor. */
    autoConvert?: boolean;
    published: boolean;
    createdAt?: string;
    updatedAt?: string;
}

/** The template kind, defaulting legacy lists to "packages". */
export function listKind(list: PricingListData): PricingListKind {
    return list.kind ?? "packages";
}

/** Render a matrix cell for a currency: note wins, else amount, else em dash. */
export function formatCell(cell: MatrixCell | undefined, currency: CurrencyCode): string {
    if (!cell) return "-";
    if (cell.note) return cell.note;
    const amt = cell.amounts?.[currency];
    return amt ? `${CURRENCIES[currency].symbol} ${amt}` : "-";
}

/** Resolve the market line for a currency (per-list override → registry default). */
export function marketFor(list: PricingListData, currency: CurrencyCode): string {
    return list.currencyMeta?.[currency]?.market ?? CURRENCIES[currency].market;
}

export function noteFor(list: PricingListData, currency: CurrencyCode): string | undefined {
    return list.currencyMeta?.[currency]?.note;
}

/** Currencies actually present on a list, in canonical order. */
export function orderedCurrencies(list: PricingListData): CurrencyCode[] {
    const present = new Set(list.currencies);
    return CURRENCY_ORDER.filter((c) => present.has(c));
}

const SLUG_MAX = 60;

export function slugify(input: string): string {
    return (input || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, SLUG_MAX) || "pricelist";
}
