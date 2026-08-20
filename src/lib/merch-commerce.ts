import { CLIENT_BILLING_CURRENCIES, type ClientBillingCurrency } from "@/lib/client-billing";
import { USD_RATES } from "@/lib/currency";

export type MerchPrices = Partial<Record<ClientBillingCurrency, number>>;

export interface MerchProduct {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit_label: string;
  prices: MerchPrices;
  design_prices: MerchPrices;
  variants: { sizes?: string[]; colors?: string[] };
  is_custom: boolean;
  presentation_image_path?: string | null;
  presentation_image_name?: string | null;
  presentation_image_url?: string | null;
  active: boolean;
  sort_order: number;
}

export interface MerchCommerceConfig {
  products: MerchProduct[];
  countries: Array<Record<string, any>>;
  deliveryZones: Array<Record<string, any>>;
  pickupLocations: Array<Record<string, any>>;
  currency: ClientBillingCurrency;
}

export const MERCH_CURRENCIES = [...CLIENT_BILLING_CURRENCIES];

export function normalizeMerchPrices(value: unknown): MerchPrices {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(MERCH_CURRENCIES.map((currency) => [currency, Math.max(0, Number(source[currency]) || 0)])) as MerchPrices;
}

export function merchPrice(prices: MerchPrices | null | undefined, currency: ClientBillingCurrency) {
  return Math.max(0, Number(prices?.[currency]) || 0);
}

export function convertMerchPricesFromUsd(usdAmount: number, current: MerchPrices = {}) {
  const usd = Math.max(0, Number(usdAmount) || 0);
  if (usd <= 0) return { ...current, USD: 0 };
  return Object.fromEntries(MERCH_CURRENCIES.map((currency) => [
    currency,
    Math.round(usd * (USD_RATES[currency] || 1) * 100) / 100,
  ])) as MerchPrices;
}

export function merchStatusLabel(status: string) {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE") return "Active";
  if (value === "COMPLETED") return "Completed";
  if (value === "AWAITING_PAYMENT") return "Awaiting payment";
  if (value === "AWAITING_QUOTE") return "Awaiting quote";
  if (value === "DRAFT") return "Draft";
  if (value === "CANCELLED") return "Cancelled";
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
