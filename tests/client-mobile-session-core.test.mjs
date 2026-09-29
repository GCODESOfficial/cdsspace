import assert from "node:assert/strict";
import test from "node:test";
import {
  MOBILE_SESSION_IDLE_SECONDS,
  MOBILE_SESSION_MAX_SECONDS,
  createMobileSessionToken,
  hashMobileSessionToken,
  normalizePlatform,
  parseMobileBearer,
  slidingExpiry,
} from "../src/lib/client-mobile-session-core.mjs";

test("a new mobile token parses from a Bearer header and hashes stably", () => {
  const token = createMobileSessionToken();
  assert.match(token, /^cdsm1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(parseMobileBearer(`Bearer ${token}`), token);
  assert.equal(parseMobileBearer(`bearer  ${token}`), token);
  assert.equal(hashMobileSessionToken(token), hashMobileSessionToken(token));
  assert.notEqual(hashMobileSessionToken(token), hashMobileSessionToken(createMobileSessionToken()));
});

test("other Bearer secrets and malformed headers are not mobile sessions", () => {
  assert.equal(parseMobileBearer(undefined), null);
  assert.equal(parseMobileBearer(""), null);
  assert.equal(parseMobileBearer("Bearer cmeet_live_abc123"), null);
  assert.equal(parseMobileBearer("Bearer cdsm1.short"), null);
  assert.equal(parseMobileBearer(`Basic ${createMobileSessionToken()}`), null);
  assert.equal(parseMobileBearer(`Bearer ${createMobileSessionToken()} extra`), null);
});

test("sliding expiry extends with use but never passes the hard cap", () => {
  const created = Date.UTC(2026, 0, 1);
  const soon = slidingExpiry(created, created + 1000);
  assert.equal(soon.getTime(), created + 1000 + MOBILE_SESSION_IDLE_SECONDS * 1000);
  const late = slidingExpiry(created, created + 80 * 24 * 3600 * 1000);
  assert.equal(late.getTime(), created + MOBILE_SESSION_MAX_SECONDS * 1000);
});

test("platform is limited to known values", () => {
  assert.equal(normalizePlatform("ios"), "ios");
  assert.equal(normalizePlatform("android"), "android");
  assert.equal(normalizePlatform("windows"), "unknown");
});
