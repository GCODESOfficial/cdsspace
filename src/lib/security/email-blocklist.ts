/**
 * Platform-wide email blocklist.
 *
 * Addresses listed here cannot sign up, sign in, redeem an invite, or be added
 * as a team member / sub-admin on any of the auth systems (client, marketer,
 * team, admin). Checks run on every entry point, so an existing session is the
 * only thing a blocked address can hold onto - and those are revoked when the
 * account is suspended.
 *
 * Extra addresses can be added at runtime with the BLOCKED_ACCOUNT_EMAILS env
 * var (comma or whitespace separated) without a code change.
 */

const BLOCKED_EMAILS = [
  "johnemediong22@gmail.com",
];

/**
 * Normalize for comparison. Gmail ignores dots in the local part and treats
 * everything after a `+` as a tag, so `j.ohn.emediong22+anything@gmail.com`
 * delivers to a blocked inbox and has to match too.
 */
export function normalizeEmailForBlocklist(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at !== email.indexOf("@")) return null;

  let local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain) return null;

  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    return `${local}@gmail.com`;
  }
  return `${local}@${domain}`;
}

function blockedSet(): Set<string> {
  const extra = (process.env.BLOCKED_ACCOUNT_EMAILS || "")
    .split(/[\s,;]+/)
    .filter(Boolean);
  const set = new Set<string>();
  for (const entry of [...BLOCKED_EMAILS, ...extra]) {
    const normalized = normalizeEmailForBlocklist(entry);
    if (normalized) set.add(normalized);
  }
  return set;
}

/** Message shown to a blocked address. Deliberately gives nothing away. */
export const BLOCKED_EMAIL_MESSAGE = "This email address cannot be used on this platform.";

export function isBlockedEmail(value: unknown): boolean {
  const normalized = normalizeEmailForBlocklist(value);
  if (!normalized) return false;
  return blockedSet().has(normalized);
}

/** Convenience for routes: returns the error message, or null when allowed. */
export function blockedEmailError(value: unknown): string | null {
  return isBlockedEmail(value) ? BLOCKED_EMAIL_MESSAGE : null;
}
