/**
 * NGN-based auto-conversion for pricelists.
 *
 * NGN is the base currency. When an admin types a Naira price, USD and RWF
 * are derived:
 *   USD = (NGN / ngnPerUsd) × usdMultiplier   (default 5× - premium intl. rate)
 *   RWF = (NGN × rwfPerNgn)  × rwfMultiplier   (default 1× - straight conversion)
 *
 * ⚙️  EDIT THE RATES BELOW to match your current exchange rates. Amounts are
 * computed at edit time and stored, so after changing rates use the
 * "Recalculate USD & RWF from NGN" button in the pricelist editor to refresh.
 */
import { CURRENCIES, CURRENCY_ORDER, type Price, type PricingListData } from "./types";

export const CONVERSION_RATES = {
    /** 1 USD = this many NGN. */
    ngnPerUsd: 1600,
    /** 1 NGN = this many RWF. */
    rwfPerNgn: 0.85,
};

export const CURRENCY_MULTIPLIERS = {
    /** USD is charged at 5× the straight conversion (international premium). */
    usd: 5,
    /** RWF is a straight 1× conversion. */
    rwf: 1,
};

/** Parse a grouped amount string ("1,350,000") into a number. */
export function parseAmount(input: string | undefined | null): number {
    const n = Number(String(input ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

/** Group an integer with commas ("1350000" → "1,350,000"). */
export function groupInt(n: number): string {
    return Math.round(n).toLocaleString("en-US");
}

function roundTo(n: number, step: number): number {
    return Math.round(n / step) * step;
}

/**
 * Convert an NGN amount to USD (×5) and RWF (×1) display strings.
 * Returns empty strings when the NGN input is blank/zero.
 */
export function convertFromNgn(ngn: string | number): { usd: string; rwf: string } {
    const n = typeof ngn === "number" ? ngn : parseAmount(ngn);
    if (!n) return { usd: "", rwf: "" };
    const usd = roundTo((n / CONVERSION_RATES.ngnPerUsd) * CURRENCY_MULTIPLIERS.usd, 5);
    const rwf = roundTo(n * CONVERSION_RATES.rwfPerNgn * CURRENCY_MULTIPLIERS.rwf, 1000);
    return { usd: groupInt(usd), rwf: groupInt(rwf) };
}

/** Recompute a single price's USD/RWF from its NGN amount. */
export function recalcPrice(price: Price): Price {
    const ngn = price.amounts?.ngn;
    if (!ngn) return price;
    const { usd, rwf } = convertFromNgn(ngn);
    return { ...price, amounts: { ...price.amounts, ngn, usd, rwf } };
}

/**
 * Apply NGN→USD/RWF conversion across a whole list and ensure all three
 * currencies are registered. Packages and price-based add-ons are recomputed
 * from their NGN amount; policy-text add-ons are left untouched.
 */
export function applyAutoConvertToList(list: PricingListData): PricingListData {
    const currencies = CURRENCY_ORDER.filter(
        (c) => c === "ngn" || c === "usd" || c === "rwf",
    );
    return {
        ...list,
        autoConvert: true,
        currencies,
        currencyMeta: {
            ...list.currencyMeta,
            ngn: { market: list.currencyMeta?.ngn?.market ?? CURRENCIES.ngn.market, note: list.currencyMeta?.ngn?.note ?? "" },
            usd: { market: list.currencyMeta?.usd?.market ?? CURRENCIES.usd.market, note: list.currencyMeta?.usd?.note ?? "" },
            rwf: { market: list.currencyMeta?.rwf?.market ?? CURRENCIES.rwf.market, note: list.currencyMeta?.rwf?.note ?? "" },
        },
        packages: list.packages.map((p) => ({ ...p, price: recalcPrice(p.price) })),
        addOns: list.addOns.map((a) =>
            a.price ? { ...a, price: recalcPrice(a.price) } : a,
        ),
        matrix: list.matrix
            ? {
                  ...list.matrix,
                  rows: list.matrix.rows.map((row) => ({
                      ...row,
                      cells: Object.fromEntries(
                          Object.entries(row.cells).map(([vid, cell]) => {
                              // Cells with a note (e.g. "Quote required") don't convert.
                              if (cell.note || !cell.amounts?.ngn) return [vid, cell];
                              const { usd, rwf } = convertFromNgn(cell.amounts.ngn);
                              return [vid, { ...cell, amounts: { ...cell.amounts, usd, rwf } }];
                          }),
                      ),
                  })),
              }
            : list.matrix,
    };
}
