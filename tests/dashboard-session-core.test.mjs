import assert from "node:assert/strict";
import test from "node:test";
import {
  createDashboardSessionToken,
  verifyDashboardSessionToken,
} from "../src/lib/dashboard-session-core.mjs";

const secret = "dashboard-session-regression-secret-".repeat(3);
const subject = "7d78cfd8-8a78-4b68-bfb1-d84a3a64e8db";
const nowSeconds = 1_800_000_000;
const lifetimeSeconds = 14 * 24 * 60 * 60;

function clientToken() {
  return createDashboardSessionToken({
    secret,
    audience: "client",
    subject,
    email: "client@example.com",
    lifetimeSeconds,
    nowSeconds,
  });
}

test("a valid first-party session preserves the stable user ID without a provider session", () => {
  const claims = verifyDashboardSessionToken(clientToken(), {
    secret,
    audience: "client",
    maxLifetimeSeconds: lifetimeSeconds,
    nowSeconds: nowSeconds + 60,
  });

  assert.equal(claims?.subject, subject);
  assert.equal(claims?.audience, "client");
});

test("a dashboard session cannot cross dashboard audiences", () => {
  const claims = verifyDashboardSessionToken(clientToken(), {
    secret,
    audience: "marketer",
    maxLifetimeSeconds: lifetimeSeconds,
    nowSeconds: nowSeconds + 60,
  });

  assert.equal(claims, null);
});

test("tampered and expired dashboard sessions fail closed", () => {
  const token = clientToken();
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.equal(verifyDashboardSessionToken(tampered, {
    secret,
    audience: "client",
    maxLifetimeSeconds: lifetimeSeconds,
    nowSeconds: nowSeconds + 60,
  }), null);
  assert.equal(verifyDashboardSessionToken(token, {
    secret,
    audience: "client",
    maxLifetimeSeconds: lifetimeSeconds,
    nowSeconds: nowSeconds + lifetimeSeconds + 1,
  }), null);
});

