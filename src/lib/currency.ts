// USD-pegged currency conversion. All prices in the app are anchored to USD;
// these rates convert 1 USD -> X of the target currency. Hand-maintained (no
// third-party API) - EDIT THESE to keep them current. Formatting uses Intl so
// symbols/grouping are correct for every currency automatically.

export const USD_RATES: Record<string, number> = {
  USD: 1,
  NGN: 1600, GHS: 15, KES: 129, ZAR: 18.5, RWF: 1300, XOF: 600, XAF: 600, EGP: 48, MAD: 10, TZS: 2600, UGX: 3800,
  EUR: 0.92, GBP: 0.79, CHF: 0.88, SEK: 10.5, NOK: 10.7, DKK: 6.9, PLN: 4.0,
  CAD: 1.37, AUD: 1.52, NZD: 1.66, BRL: 5.4, MXN: 18, ARS: 950,
  AED: 3.67, SAR: 3.75, QAR: 3.64, KWD: 0.31,
  INR: 83, PKR: 278, BDT: 118, CNY: 7.2, JPY: 155, KRW: 1360, SGD: 1.34, HKD: 7.8, IDR: 16000, PHP: 58, THB: 36, MYR: 4.6, TRY: 33,
};

export function convertFromUsd(usd: number, currency: string): number {
  return usd * (USD_RATES[currency.toUpperCase()] ?? 1);
}

export function formatMoney(amount: number, currency: string, compact = false): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${code} ${Math.round(amount).toLocaleString()}`;
  }
}

/**
 * Rewrites a USD budget label (e.g. "$1k - $10k", "$200k+", "Under $1k") into
 * the visitor's currency, keeping the surrounding words. Returns the original
 * label unchanged for USD or unknown currencies.
 */
export function localizeBudgetLabel(usdLabel: string, currency: string): string {
  const code = currency.toUpperCase();
  if (!code || code === "USD" || !USD_RATES[code]) return usdLabel;
  return usdLabel.replace(/\$(\d+(?:\.\d+)?)\s*([km])?/gi, (_m, num: string, unit?: string) => {
    let usd = parseFloat(num);
    if (unit?.toLowerCase() === "k") usd *= 1_000;
    else if (unit?.toLowerCase() === "m") usd *= 1_000_000;
    return formatMoney(convertFromUsd(usd, code), code, true);
  });
}
