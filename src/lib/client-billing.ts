export const CLIENT_BILLING_CURRENCIES = ["NGN", "USD", "GBP", "EUR", "RWF", "CNY", "AED"] as const;

export type ClientBillingCurrency = (typeof CLIENT_BILLING_CURRENCIES)[number];

export function isClientBillingCurrency(value: unknown): value is ClientBillingCurrency {
  return typeof value === "string" && CLIENT_BILLING_CURRENCIES.includes(value.toUpperCase() as ClientBillingCurrency);
}

export function normalizeClientBillingCurrency(value: unknown): ClientBillingCurrency | null {
  return isClientBillingCurrency(value) ? value.toUpperCase() as ClientBillingCurrency : null;
}

export function clientBillingCurrencyLabel(currency: ClientBillingCurrency) {
  return CLIENT_BILLING_CURRENCY_OPTIONS.find((option) => option.code === currency)?.name || currency;
}

export const CLIENT_BILLING_CURRENCY_OPTIONS: ReadonlyArray<{
  code: ClientBillingCurrency;
  name: string;
  symbol: string;
  description: string;
}> = [
  {
    code: "NGN",
    name: "Nigerian Naira",
    symbol: "₦",
    description: "For brands registered with CAC and operating within Nigeria.",
  },
  {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    description: "For international brands registered outside Nigeria.",
  },
  {
    code: "GBP",
    name: "British Pound",
    symbol: "£",
    description: "For international brands registered outside Nigeria.",
  },
  {
    code: "EUR",
    name: "Euro",
    symbol: "€",
    description: "For international brands registered outside Nigeria.",
  },
  {
    code: "RWF",
    name: "Rwandan Franc",
    symbol: "FRw",
    description: "For companies registered with RDB and operating within Rwanda.",
  },
  {
    code: "CNY",
    name: "Chinese Yuan",
    symbol: "¥",
    description: "For international brands registered outside Nigeria.",
  },
  {
    code: "AED",
    name: "UAE Dirham",
    symbol: "AED",
    description: "For companies duly licensed and operating within the United Arab Emirates (UAE).",
  },
];
