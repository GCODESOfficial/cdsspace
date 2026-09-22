/**
 * NGN-first pricing for every admin surface that takes a price.
 *
 * One rule, everywhere: an admin types a Naira figure and nothing else. The
 * pricelist editor's formula sets the two anchors, and every remaining currency
 * follows the USD anchor at the app's standing rates:
 *
 *   USD = (NGN / 1,600) x 5     the international premium, from CONVERSION_RATES
 *   RWF =  NGN x 0.85 x 1       a straight conversion
 *   everything else = USD x USD_RATES[currency]
 *
 * RWF is deliberately taken from Naira rather than from the premium USD figure,
 * because Rwanda is priced as a local market, not an international one. Deriving
 * it from USD would quietly charge Kigali the 5x premium.
 *
 * Rates live in two hand-maintained places and are not fetched: edit
 * `CONVERSION_RATES` / `CURRENCY_MULTIPLIERS` in `src/lib/pricing/conversion.ts`
 * for the two anchors, and `USD_RATES` in `src/lib/currency.ts` for the rest.
 * Amounts are computed at edit time and stored, so after a rate change an
 * existing price only moves when somebody re-enters or recalculates it.
 */
import { CLIENT_BILLING_CURRENCIES, type ClientBillingCurrency } from "@/lib/client-billing";
import { USD_RATES } from "@/lib/currency";
import { CONVERSION_RATES, CURRENCY_MULTIPLIERS } from "@/lib/pricing/conversion";

export type ClientPriceSet = Partial<Record<ClientBillingCurrency, number>>;

/** The two anchors, from the Naira figure the admin typed. */
export function usdFromNgn(ngn: number) {
  const amount = Math.max(0, Number(ngn) || 0);
  if (!amount) return 0;
  return (amount / CONVERSION_RATES.ngnPerUsd) * CURRENCY_MULTIPLIERS.usd;
}

export function rwfFromNgn(ngn: number) {
  const amount = Math.max(0, Number(ngn) || 0);
  if (!amount) return 0;
  return amount * CONVERSION_RATES.rwfPerNgn * CURRENCY_MULTIPLIERS.rwf;
}

/** Two decimals for the small currencies, whole units for the ones counted in thousands. */
function tidy(currency: ClientBillingCurrency, amount: number) {
  if (!amount) return 0;
  const whole = currency === "NGN" || currency === "RWF" || currency === "CNY";
  return whole ? Math.round(amount) : Math.round(amount * 100) / 100;
}

/**
 * The full price set for one Naira figure. `current` is carried through so a
 * currency this app does not know a rate for keeps whatever was already set.
 */
export function convertClientPricesFromNgn(ngn: number, current: ClientPriceSet = {}): ClientPriceSet {
  const amount = Math.max(0, Number(ngn) || 0);
  if (!amount) {
    return Object.fromEntries(CLIENT_BILLING_CURRENCIES.map((currency) => [currency, 0])) as ClientPriceSet;
  }
  const usd = usdFromNgn(amount);
  return Object.fromEntries(
    CLIENT_BILLING_CURRENCIES.map((currency) => {
      if (currency === "NGN") return [currency, tidy(currency, amount)];
      if (currency === "USD") return [currency, tidy(currency, usd)];
      if (currency === "RWF") return [currency, tidy(currency, rwfFromNgn(amount))];
      const rate = USD_RATES[currency];
      return [currency, rate ? tidy(currency, usd * rate) : (current[currency] ?? 0)];
    }),
  ) as ClientPriceSet;
}

/** Which currencies an admin never types, so the UI can mark them as derived. */
export function isDerivedCurrency(currency: ClientBillingCurrency) {
  return currency !== "NGN";
}

/** The sentence shown under every NGN-first price grid, so the rule reads the same everywhere. */
export const NGN_BASE_HINT =
  `Naira is the base price. Every other currency is calculated from it: USD at ${CURRENCY_MULTIPLIERS.usd}x the ${CONVERSION_RATES.ngnPerUsd.toLocaleString()} rate, RWF at a straight ${CONVERSION_RATES.rwfPerNgn} conversion, and the rest from that USD figure. Any converted field can still be overridden by hand.`;
