import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { deflateRawSync, inflateRawSync } from "zlib";
import { sessionRequiresDailyLogout } from "@/lib/team-session-policy";

/**
 * Signed admin_session cookie.
 *
 * The cookie previously held plain JSON that every admin guard trusted
 * verbatim - so anyone could forge `admin_session={"role":"super_admin",...}`
 * and become super admin (httpOnly only blocks JS reads, not crafted
 * requests). We now HMAC-sign the payload and reject anything that doesn't
 * verify: forged or tampered cookies (and legacy unsigned ones) fail closed.
 *
 * Secret: ADMIN_SESSION_SECRET if set, else the GlashDB service-role key
 * (always present server-side, never shipped to clients). If neither exists,
 * verification returns null - i.e. no admin access, which is the safe default.
 */
const SECRET = process.env.ADMIN_SESSION_SECRET || process.env.GLASHDB_SERVICE_ROLE_KEY || "";
const COMPRESSED_PREFIX = "z.";

function mac(serializedPayload: string): string {
  return createHmac("sha256", SECRET).update(serializedPayload).digest("hex");
}

/** Serialize + sign a session object for the `admin_session` cookie value. */
export function signAdminCookie(payload: Record<string, unknown>): string {
  // Permission-aware team admins can hold more than 100 explicit permission
  // keys. Encoding that JSON directly made the Set-Cookie response exceed the
  // production proxy's header budget, so the otherwise-successful handoff was
  // replaced with a 502 for only those admins. Raw DEFLATE keeps the complete
  // signed claim set while reducing those cookies to roughly a third of their
  // former size.
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload))).toString("base64url");
  const serializedPayload = `${COMPRESSED_PREFIX}${compressed}`;
  return `${serializedPayload}.${mac(serializedPayload)}`;
}

/** Shared options for every admin-session gateway and bridge. */
export function adminSessionCookieOptions(maxAge = 60 * 60 * 24) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/**
 * Verify + decode a signed admin_session cookie. Returns null for missing,
 * malformed, unsigned (legacy), or tampered values.
 */
export function verifyAdminCookie<T = Record<string, unknown>>(raw: string | undefined | null): T | null {
  if (!raw || !SECRET) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const serializedPayload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(mac(serializedPayload), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    // Continue accepting already-issued uncompressed cookies until they
    // expire. New cookies are prefixed and compressed before signing.
    const json = serializedPayload.startsWith(COMPRESSED_PREFIX)
      ? inflateRawSync(Buffer.from(serializedPayload.slice(COMPRESSED_PREFIX.length), "base64url")).toString("utf8")
      : Buffer.from(serializedPayload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as T & {
      role?: string;
      issuedAt?: string;
    };
    if (parsed.role === "sub_admin" && sessionRequiresDailyLogout(parsed.issuedAt)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}
