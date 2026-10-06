import test from "node:test";
import assert from "node:assert/strict";
import { adminBearerToken, adminMobileSessionLive, parseAdminBearer } from "../src/lib/admin-mobile-session-core.mjs";

const signed = `z.${"A".repeat(40)}.${"a".repeat(64)}`;

test("admin bearer round-trips the signed admin_session value", () => {
  assert.equal(parseAdminBearer(`Bearer ${adminBearerToken(signed)}`), signed);
  assert.equal(parseAdminBearer(`bearer   ${adminBearerToken(signed)}`), signed);
});

test("other bearer shapes are ignored", () => {
  assert.equal(parseAdminBearer(`Bearer cdst1.${"a".repeat(64)}`), null);
  assert.equal(parseAdminBearer(`Bearer cdsm1.${"A".repeat(43)}`), null);
  assert.equal(parseAdminBearer(`Bearer cdsa1.${"A".repeat(10)}`), null);
  assert.equal(parseAdminBearer(`Bearer cdsa1.z.AAA.${"g".repeat(64)}`), null);
  assert.equal(parseAdminBearer(null), null);
  assert.equal(parseAdminBearer(`Bearer cdsa1.z.${"A".repeat(9000)}.${"a".repeat(64)}`), null);
});

test("mobile admin sessions last 24 hours", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  assert.equal(adminMobileSessionLive("2026-10-02T00:00:00Z", now), true);
  assert.equal(adminMobileSessionLive("2026-10-01T11:59:00Z", now), false);
  assert.equal(adminMobileSessionLive("2026-10-03T00:00:00Z", now), false);
  assert.equal(adminMobileSessionLive(undefined, now), false);
});
