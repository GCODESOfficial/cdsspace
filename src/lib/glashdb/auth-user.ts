import type { User } from "@supabase/supabase-js";
import { getGlashDbJwtSecret } from "@/lib/glashdb/env";

/**
 * Resolve a cryptographically verified auth user.
 *
 * `getUser()` asks GlashDB and remains the primary path. When that endpoint is
 * down, the session's access token is verified here against GlashDB's HS256
 * signing secret instead. GlashDB publishes no JWKS, so `getClaims()` cannot
 * verify on its own; it is only tried when no secret is configured. Unlike
 * trusting getSession() alone, every path checks the signature first.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getVerifiedAuthUser(auth: any): Promise<User | null> {
  const { data: userData, error: userError } = await auth.getUser();
  if (!userError && userData?.user) {
    const user = userData.user as User;
    return confirmed(user) ? user : null;
  }

  const { data: sessionData } = await auth.getSession();
  const session = sessionData?.session;
  const sessionUser = session?.user as User | undefined;
  if (!sessionUser || !confirmed(sessionUser)) return null;

  const secret = getGlashDbJwtSecret();
  if (secret) {
    const subject = await verifiedSubject(session.access_token, secret);
    return subject && subject === sessionUser.id ? sessionUser : null;
  }

  if (typeof auth.getClaims !== "function") return null;
  const { data: claimsData, error: claimsError } = await auth.getClaims();
  const subject = claimsData?.claims?.sub;
  return !claimsError && subject && subject === sessionUser.id ? sessionUser : null;
}

function confirmed(user: User) {
  return Boolean(user.email && (user.email_confirmed_at || user.confirmed_at));
}

function base64UrlBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/**
 * The token's subject when its HS256 signature is valid and it has not
 * expired, otherwise null. Web Crypto, so it also runs in the edge middleware.
 */
async function verifiedSubject(token: unknown, secret: string): Promise<string | null> {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[0])));
    if (header?.alg !== "HS256") return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, base64UrlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[1])));
    if (typeof claims?.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
    if (claims.role !== "authenticated" || typeof claims.sub !== "string") return null;
    return claims.sub;
  } catch {
    return null;
  }
}
