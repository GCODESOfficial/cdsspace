import "server-only";

import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { clientRequestContext, consumeSecurityRateLimit, normalizeClientEmail } from "@/lib/client-login-security";

export const EXISTING_ACCOUNT_MESSAGE = "An account with this email already exists. Sign in instead.";
export const EMAIL_CHECK_LIMITED_MESSAGE = "Too many requests. Try again shortly.";

// Whether a verified client account owns this address. Pending (never verified)
// sign-ups don't count: signing up again sends them a fresh code.
// The app says so on its sign-up form, which reveals whether an address is
// registered, so every lookup is rate limited per network.
export async function lookupRegisteredClientEmail(email: string): Promise<"limited" | "exists" | "free"> {
  const context = await clientRequestContext();
  const limited = await consumeSecurityRateLimit({
    bucket: "client-signup-email-check",
    identifier: context.ipHash,
    limit: 30,
    windowSeconds: 10 * 60,
    blockSeconds: 10 * 60,
  });
  if (limited) return "limited";

  const normalized = normalizeClientEmail(email);
  if (!normalized) return "free";
  const row = await glashMaybeOne<{ id: string }>(
    "select id from public.profiles where lower(email) = $1 and email_verified_at is not null limit 1",
    [normalized],
  );
  return row ? "exists" : "free";
}
