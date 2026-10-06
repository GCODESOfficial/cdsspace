import { createHash, randomBytes } from "node:crypto";

// Pure helpers for mobile app session tokens, kept free of server imports so
// they can be tested directly.

export const MOBILE_TOKEN_PREFIX = "cdsm1";
export const MOBILE_SESSION_IDLE_SECONDS = 30 * 24 * 60 * 60; // expires after 30 days unused
export const MOBILE_SESSION_MAX_SECONDS = 90 * 24 * 60 * 60; // and 90 days after sign-in at most
export const MOBILE_SESSION_TOUCH_SECONDS = 6 * 60 * 60; // refresh last_used_at at most every 6 hours

const TOKEN_PATTERN = /^cdsm1\.[A-Za-z0-9_-]{43}$/;

export function createMobileSessionToken() {
  return `${MOBILE_TOKEN_PREFIX}.${randomBytes(32).toString("base64url")}`;
}

export function hashMobileSessionToken(token) {
  return createHash("sha256").update(`cds-mobile-session:${token}`).digest("hex");
}

// "Authorization: Bearer cdsm1.…" → token, or null for anything else. Other
// Bearer secrets (cron, cMeet API keys) have different shapes and are ignored.
export function parseMobileBearer(headerValue) {
  if (typeof headerValue !== "string" || headerValue.length > 512) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim());
  if (!match) return null;
  return TOKEN_PATTERN.test(match[1]) ? match[1] : null;
}

// New expiry after use: idle window from now, capped at the hard maximum.
export function slidingExpiry(createdAtMs, nowMs = Date.now()) {
  return new Date(Math.min(nowMs + MOBILE_SESSION_IDLE_SECONDS * 1000, createdAtMs + MOBILE_SESSION_MAX_SECONDS * 1000));
}

export function normalizePlatform(value) {
  return value === "ios" || value === "android" ? value : "unknown";
}
