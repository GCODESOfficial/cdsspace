"use client";

import { RefreshCw } from "lucide-react";
import { CLIENT_BILLING_CURRENCIES, type ClientBillingCurrency } from "@/lib/client-billing";
import {
  convertClientPricesFromNgn,
  isDerivedCurrency,
  NGN_BASE_HINT,
  type ClientPriceSet,
} from "@/lib/pricing/client-currency";

/**
 * The one price grid used by every admin surface that takes a price.
 *
 * Typing into Naira recalculates every other currency. The derived fields stay
 * editable, because a rate is a starting point and a price sometimes has to be
 * rounded for a particular market, but they are visibly secondary and one
 * button puts them back in line with the Naira figure.
 */
export default function NgnPriceInputs({
  prices,
  onChange,
  columns = "sm:grid-cols-2 xl:grid-cols-4",
  inputClassName = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-[12px] text-[#0D1B39] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100",
  currencies = CLIENT_BILLING_CURRENCIES,
  hint = NGN_BASE_HINT,
}: {
  prices: ClientPriceSet;
  onChange: (prices: ClientPriceSet) => void;
  columns?: string;
  inputClassName?: string;
  currencies?: ReadonlyArray<ClientBillingCurrency>;
  hint?: string;
}) {
  const change = (currency: ClientBillingCurrency, rawValue: string) => {
    const amount = Math.max(0, Number(rawValue) || 0);
    onChange(currency === "NGN"
      ? { ...prices, ...convertClientPricesFromNgn(amount, prices) }
      : { ...prices, [currency]: amount });
  };

  const ngn = Number(prices?.NGN) || 0;

  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${columns}`}>
        {currencies.map((currency) => (
          <label key={currency} className="relative">
            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold ${currency === "NGN" ? "text-[#0A4FE8]" : "text-slate-400"}`}>{currency}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={Number(prices?.[currency]) || ""}
              onChange={(event) => change(currency, event.target.value)}
              placeholder={isDerivedCurrency(currency) ? "auto" : "Not set"}
              aria-label={`${currency} price`}
              className={`${inputClassName} w-full pl-12 ${currency === "NGN" ? "border-blue-200 bg-blue-50/40" : ""}`}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[10px] leading-4 text-slate-400">{hint}</p>
        <button
          type="button"
          onClick={() => onChange({ ...prices, ...convertClientPricesFromNgn(ngn, prices) })}
          disabled={!ngn}
          title="Put every converted currency back in line with the Naira price"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:border-[#0A4FE8] hover:text-[#0A4FE8] disabled:opacity-40"
        >
          <RefreshCw className="h-3 w-3" /> Recalculate
        </button>
      </div>
    </div>
  );
}
