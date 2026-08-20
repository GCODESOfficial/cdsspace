import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

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

function mac(payloadB64: string): string {
  return createHmac("sha256", SECRET).update(payloadB64).digest("hex");
}

/** Serialize + sign a session object for the `admin_session` cookie value. */
export function signAdminCookie(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${b64}.${mac(b64)}`;
}

/**
 * Verify + decode a signed admin_session cookie. Returns null for missing,
 * malformed, unsigned (legacy), or tampered values.
 */
export function verifyAdminCookie<T = Record<string, unknown>>(raw: string | undefined | null): T | null {
  if (!raw || !SECRET) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const b64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(mac(b64), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
