/**
 * How this browser signed in last time.
 *
 * The sign-in page leads with the social buttons, so it needs to say which one
 * this person actually used and under which email. That is a per-browser
 * convenience, never a credential: only the address and the provider name are
 * kept, and every read and write is guarded because a private window or a
 * browser set to block site data throws on access.
 */
export type LastAccessProvider = "google" | "linkedin" | "password";

export type LastAccess = {
  email: string;
  /** Human-readable, shown under the email on the sign-in page. */
  method: string;
  provider: LastAccessProvider;
  at: string;
};

const KEY = "cds.client.lastAccess";
/** Set when a provider button is clicked, promoted to a real record if it works. */
const PENDING_KEY = "cds.client.pendingProvider";

const METHOD_LABEL: Record<LastAccessProvider, string> = {
  google: "Google",
  linkedin: "LinkedIn",
  password: "Email and password",
};

export function providerLabel(provider: LastAccessProvider) {
  return METHOD_LABEL[provider] || METHOD_LABEL.password;
}

export function readLastAccess(): LastAccess | null {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<LastAccess>;
    if (!parsed.email || !parsed.at) return null;
    // Records written before providers were tracked only knew about passwords.
    const provider: LastAccessProvider = parsed.provider === "google" || parsed.provider === "linkedin" ? parsed.provider : "password";
    return { email: parsed.email, provider, method: parsed.method || providerLabel(provider), at: parsed.at };
  } catch {
    try { window.localStorage.removeItem(KEY); } catch { /* nothing more to do */ }
    return null;
  }
}

export function rememberLastAccess(input: { email: string; provider: LastAccessProvider; method?: string }) {
  if (!input.email) return;
  try {
    const record: LastAccess = {
      email: input.email,
      provider: input.provider,
      method: input.method || providerLabel(input.provider),
      at: new Date().toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch { /* storage can be blocked; the hint is optional */ }
}

/**
 * A provider sign-in leaves the site before it succeeds, so the button records
 * its intent and the OAuth callback promotes it once there is a session. An
 * abandoned attempt leaves only this marker, which is read once and cleared.
 */
export function rememberPendingProvider(provider: Exclude<LastAccessProvider, "password">) {
  try { window.localStorage.setItem(PENDING_KEY, provider); } catch { /* optional */ }
}

export function takePendingProvider(): Exclude<LastAccessProvider, "password"> | null {
  try {
    const value = window.localStorage.getItem(PENDING_KEY);
    window.localStorage.removeItem(PENDING_KEY);
    return value === "google" || value === "linkedin" ? value : null;
  } catch {
    return null;
  }
}
