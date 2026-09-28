import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { CLIENT_BILLING_CURRENCIES, type ClientBillingCurrency } from "@/lib/client-billing";

/**
 * What CDS Space charges to design a client's letterhead.
 *
 * Naira and Rwandan francs are set directly because they are local-market
 * prices; every other currency is the USD price carried across. All of them
 * are editable in Sales Settings, so a rate change never needs a deploy.
 */
export type LetterheadDesignPrices = Record<ClientBillingCurrency, number>;

const COLUMN: Record<ClientBillingCurrency, string> = {
  NGN: "price_ngn", USD: "price_usd", GBP: "price_gbp",
  EUR: "price_eur", RWF: "price_rwf", CNY: "price_cny", AED: "price_aed",
};

/** The prices as last saved, falling back to the seeded defaults. */
export async function getLetterheadDesignPrices(): Promise<LetterheadDesignPrices> {
  const row = await glashMaybeOne<Record<string, unknown>>(
    `select ${Object.values(COLUMN).join(", ")} from public.letterhead_design_pricing where id is true`,
  ).catch(() => null);
  const fallback: LetterheadDesignPrices = { NGN: 15000, USD: 25, GBP: 19.75, EUR: 23, RWF: 20000, CNY: 180, AED: 91.75 };
  if (!row) return fallback;
  return Object.fromEntries(
    CLIENT_BILLING_CURRENCIES.map((currency) => {
      const value = Number(row[COLUMN[currency]]);
      return [currency, Number.isFinite(value) && value > 0 ? value : fallback[currency]];
    }),
  ) as LetterheadDesignPrices;
}

export async function saveLetterheadDesignPrices(prices: Partial<LetterheadDesignPrices>, actor: string) {
  const current = await getLetterheadDesignPrices();
  const next = { ...current, ...prices };
  const columns = CLIENT_BILLING_CURRENCIES.map((currency, index) => `${COLUMN[currency]} = $${index + 1}`);
  await glashQuery(
    `insert into public.letterhead_design_pricing (id) values (true) on conflict (id) do nothing`,
  );
  await glashQuery(
    `update public.letterhead_design_pricing
        set ${columns.join(", ")}, updated_by = $${CLIENT_BILLING_CURRENCIES.length + 1}, updated_at = now()
      where id is true`,
    [...CLIENT_BILLING_CURRENCIES.map((currency) => Math.max(0, Number(next[currency]) || 0)), actor],
  );
  return next;
}

/** The price to bill this client, in the currency their account is billed in. */
export async function letterheadDesignPriceFor(currency: string) {
  const prices = await getLetterheadDesignPrices();
  const code = (currency || "NGN").toUpperCase() as ClientBillingCurrency;
  const known = CLIENT_BILLING_CURRENCIES.includes(code) ? code : "NGN";
  return { currency: known, amount: prices[known] };
}
