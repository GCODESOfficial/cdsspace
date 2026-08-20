import { USD_RATES } from "@/lib/currency";
import { CURRENCIES, type Currency } from "@/lib/finance/types";

export type FinanceExchangeRates = Partial<Record<Currency, number>>;

export const DEFAULT_FINANCE_CURRENCY: Currency = "NGN";
export const DEFAULT_FINANCE_RATES: FinanceExchangeRates = Object.fromEntries(
  CURRENCIES.map((currency) => [currency, USD_RATES[currency] || 1]),
) as FinanceExchangeRates;

export function isFinanceCurrency(value: unknown): value is Currency {
  return CURRENCIES.includes(String(value || "").toUpperCase() as Currency);
}

export function convertFinanceAmount(
  amount: number | string | null | undefined,
  sourceCurrency: Currency | string | null | undefined,
  displayCurrency: Currency,
  rates: FinanceExchangeRates = DEFAULT_FINANCE_RATES,
) {
  const source = isFinanceCurrency(sourceCurrency) ? sourceCurrency : DEFAULT_FINANCE_CURRENCY;
  const sourceRate = Number(rates[source]) || 1;
  const displayRate = Number(rates[displayCurrency]) || 1;
  return (Number(amount || 0) / sourceRate) * displayRate;
}

