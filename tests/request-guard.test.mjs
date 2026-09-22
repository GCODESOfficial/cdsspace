import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationRateProfile,
  clientNetworkFromHeaders,
} from "../src/lib/security/request-guard-core.mjs";

test("rate-limit identity prefers the original client over a shared proxy address", () => {
  const first = new Headers({
    "x-forwarded-for": "203.0.113.10, 10.0.0.8",
    "x-real-ip": "10.0.0.8",
  });
  const second = new Headers({
    "x-forwarded-for": "203.0.113.11, 10.0.0.8",
    "x-real-ip": "10.0.0.8",
  });

  assert.equal(clientNetworkFromHeaders(first), "203.0.113.10");
  assert.equal(clientNetworkFromHeaders(second), "203.0.113.11");
  assert.notEqual(clientNetworkFromHeaders(first), clientNetworkFromHeaders(second));
});

test("safe page navigation is not handled by the application API limiter", () => {
  assert.equal(applicationRateProfile("/team/cdocs", "GET"), null);
  assert.equal(applicationRateProfile("/team/cdocs", "HEAD"), null);
  assert.equal(applicationRateProfile("/team/cdocs", "POST")?.name, "page-mutation");
});

test("API and authentication limits remain enabled", () => {
  assert.equal(applicationRateProfile("/api/cdocs", "GET")?.name, "api-read");
  assert.equal(applicationRateProfile("/api/cdocs", "POST")?.name, "api-mutation");
  assert.equal(applicationRateProfile("/api/team/login", "POST")?.name, "authentication");
  assert.equal(applicationRateProfile("/api/security/bot-challenge", "POST")?.name, "bot-challenge");
});
