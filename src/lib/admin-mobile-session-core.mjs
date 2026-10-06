// Pure helpers for admin sessions used by the mobile app, kept free of server
// imports so they can be tested directly.
//
// The app has no cookies, so it sends its admin session as
// "Authorization: Bearer cdsa1.<signed admin_session value>". The value is the
// same HMAC-signed claim set the web keeps in the admin_session cookie, so every
// admin guard verifies it unchanged: forged or tampered values fail closed,
// sub-admins are re-read from the database on each request and end at the
// daily 18:15 Lagos cutoff. The proxy additionally refuses tokens older than
// ADMIN_MOBILE_SESSION_SECONDS (the web cookie's maxAge).

export const ADMIN_BEARER_PREFIX = "cdsa1";
export const ADMIN_MOBILE_SESSION_SECONDS = 24 * 60 * 60;

// Signed cookie values: "z.<base64url>.<hex mac>" (or a legacy "<base64url>.<hex mac>").
const TOKEN_PATTERN = /^cdsa1\.((?:z\.)?[A-Za-z0-9_-]+\.[a-f0-9]{64})$/;

export function adminBearerToken(signedCookieValue) {
  return `${ADMIN_BEARER_PREFIX}.${signedCookieValue}`;
}

// "Authorization: Bearer cdsa1.…" → the signed admin_session value, or null for
// anything else (client "cdsm1." and team "cdst1." tokens have other shapes).
export function parseAdminBearer(headerValue) {
  if (typeof headerValue !== "string" || headerValue.length > 8192) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim());
  if (!match) return null;
  const token = TOKEN_PATTERN.exec(match[1]);
  return token ? token[1] : null;
}

// True while a token issued at `issuedAt` is inside the mobile session window.
export function adminMobileSessionLive(issuedAt, nowMs = Date.now()) {
  const issued = Date.parse(issuedAt || "");
  if (Number.isNaN(issued)) return false;
  return issued <= nowMs + 60_000 && nowMs - issued < ADMIN_MOBILE_SESSION_SECONDS * 1000;
}
