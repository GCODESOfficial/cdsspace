import "server-only";

import type { ClientBillingCurrency } from "@/lib/client-billing";
import { normalizeClientBillingCurrency } from "@/lib/client-billing";

interface ProfileCurrencyQuery {
  from: (table: string) => {
    select: (columns: string) => {
      ilike: (column: string, value: string) => {
        limit: (count: number) => {
          maybeSingle: () => Promise<{ data?: { billing_currency?: string | null } | null; error?: unknown }>;
        };
      };
    };
  };
}

/**
 * Registered client accounts own their billing currency. An admin-selected
 * currency remains the fallback for contacts who do not have a client account.
 */
export async function resolveClientBillingCurrency(
  db: ProfileCurrencyQuery,
  email: unknown,
  fallback: string,
): Promise<string> {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) return fallback;

  const { data, error } = await db
    .from("profiles")
    .select("billing_currency")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error) return fallback;
  return normalizeClientBillingCurrency(data?.billing_currency) || fallback;
}

export function clientCurrencyOrDefault(value: unknown): ClientBillingCurrency {
  return normalizeClientBillingCurrency(value) || "USD";
}
