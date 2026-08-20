import { createHmac, timingSafeEqual } from "node:crypto";

export const DASHBOARD_SESSION_PURPOSE = "cds-dashboard-session";
export const DASHBOARD_SESSION_VERSION = 1;
export const DEFAULT_DASHBOARD_SESSION_LIFETIME_SECONDS = 14 * 24 * 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIENCE_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;

function signature(secret, payload) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Create the first-party session used after a dashboard login gateway has
 * completed. The stable auth user UUID is the principal; provider tokens are
 * deliberately not part of the navigation contract.
 */
export function createDashboardSessionToken({
  secret,
  audience,
  subject,
  email = "",
  lifetimeSeconds = DEFAULT_DASHBOARD_SESSION_LIFETIME_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Dashboard session secret is not configured.");
  if (!AUDIENCE_PATTERN.test(audience)) throw new Error("Invalid dashboard session audience.");
  if (!UUID_PATTERN.test(subject)) throw new Error("Invalid dashboard session subject.");
  if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds <= 0) throw new Error("Invalid dashboard session lifetime.");

  const claims = {
    purpose: DASHBOARD_SESSION_PURPOSE,
    version: DASHBOARD_SESSION_VERSION,
    audience,
    subject,
    email: String(email || "").slice(0, 320),
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + lifetimeSeconds,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(secret, payload)}`;
}

export function verifyDashboardSessionToken(
  token,
  {
    secret,
    audience,
    maxLifetimeSeconds = DEFAULT_DASHBOARD_SESSION_LIFETIME_SECONDS,
    nowSeconds = Math.floor(Date.now() / 1000),
  },
) {
  if (typeof secret !== "string" || secret.length < 32) return null;
  if (typeof token !== "string" || token.length > 4096) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expected = Buffer.from(signature(secret, payload));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const lifetime = claims.expiresAt - claims.issuedAt;
    if (
      claims.purpose !== DASHBOARD_SESSION_PURPOSE
      || claims.version !== DASHBOARD_SESSION_VERSION
      || claims.audience !== audience
      || !UUID_PATTERN.test(claims.subject)
      || typeof claims.email !== "string"
      || claims.email.length > 320
      || !Number.isInteger(claims.issuedAt)
      || !Number.isInteger(claims.expiresAt)
      || claims.issuedAt > nowSeconds + 60
      || claims.expiresAt <= nowSeconds
      || !Number.isInteger(lifetime)
      || lifetime <= 0
      || lifetime > maxLifetimeSeconds
    ) return null;
    return claims;
  } catch {
    return null;
  }
}

