"use client";

import { useCallback, useEffect, useState } from "react";
import { CURRENCIES, CURRENCY_NAMES, type Currency } from "@/lib/finance/types";
import { DEFAULT_FINANCE_CURRENCY, DEFAULT_FINANCE_RATES, type FinanceExchangeRates } from "@/lib/finance/currency-display";

const EVENT = "cds:finance-currency";
let cachedCurrency: Currency = DEFAULT_FINANCE_CURRENCY;
let cachedRates: FinanceExchangeRates = DEFAULT_FINANCE_RATES;
let loaded = false;

export function useFinanceDisplayCurrency() {
  const [currency, setCurrencyState] = useState<Currency>(cachedCurrency);
  const [rates, setRates] = useState<FinanceExchangeRates>(cachedRates);

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ currency: Currency; rates?: FinanceExchangeRates }>).detail;
      if (detail?.currency) setCurrencyState(detail.currency);
      if (detail?.rates) setRates(detail.rates);
    };
    window.addEventListener(EVENT, sync);
    if (!loaded) {
      loaded = true;
      fetch("/api/admin/finance/settings", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (!payload?.settings) return;
          cachedCurrency = payload.settings.display_currency || DEFAULT_FINANCE_CURRENCY;
          cachedRates = { ...DEFAULT_FINANCE_RATES, ...(payload.settings.exchange_rates || {}) };
          window.dispatchEvent(new CustomEvent(EVENT, { detail: { currency: cachedCurrency, rates: cachedRates } }));
        })
        .catch(() => undefined);
    } else {
      setCurrencyState(cachedCurrency);
      setRates(cachedRates);
    }
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const setCurrency = useCallback(async (next: Currency) => {
    const previous = cachedCurrency;
    cachedCurrency = next;
    setCurrencyState(next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { currency: next, rates: cachedRates } }));
    const response = await fetch("/api/admin/finance/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_currency: next }),
    });
    if (!response.ok) {
      cachedCurrency = previous;
      setCurrencyState(previous);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { currency: previous, rates: cachedRates } }));
    }
  }, []);

  return { currency, rates, setCurrency };
}

export default function FinanceCurrencySelector() {
  const { currency, setCurrency } = useFinanceDisplayCurrency();
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="hidden text-[11px] font-semibold text-slate-500 sm:inline">View finances in</span>
      <select
        aria-label="Finance display currency"
        value={currency}
        onChange={(event) => void setCurrency(event.target.value as Currency)}
        className="bg-transparent text-[12px] font-bold text-[#0D1B39] outline-none"
      >
        {CURRENCIES.map((code) => <option key={code} value={code}>{code} · {CURRENCY_NAMES[code]}</option>)}
      </select>
    </label>
  );
}
