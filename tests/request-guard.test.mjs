import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationRateProfile,
  clientNetworkFromHeaders,
  DELIVERY_CHUNK_MAX_BYTES,
  DELIVERY_CHUNK_PATH,
  mutationBodyLimit,
  rateLimitBuckets,
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

test("signed-in API traffic is limited per session, with a larger per-network ceiling", () => {
  const profile = applicationRateProfile("/api/admin-check", "GET");
  const office = "203.0.113.20";
  const first = rateLimitBuckets(profile, office, "session-a");
  const second = rateLimitBuckets(profile, office, "session-b");

  // Two staff on the same office connection no longer share a bucket...
  assert.notEqual(first[0].key, second[0].key);
  assert.equal(first[0].capacity, profile.capacity);
  // ...but both still count against one network ceiling sized for an office.
  assert.equal(first[1].key, second[1].key);
  assert.ok(first[1].capacity > profile.capacity);
});

test("anonymous requests and login attempts stay limited per network", () => {
  const read = applicationRateProfile("/api/admin-check", "GET");
  assert.deepEqual(rateLimitBuckets(read, "203.0.113.20", null).map((bucket) => bucket.key), ["api-read:network:203.0.113.20"]);
  const login = applicationRateProfile("/api/admin-login", "POST");
  assert.equal(rateLimitBuckets(login, "203.0.113.20", "session-a").length, 1);
  assert.equal(rateLimitBuckets(login, "203.0.113.20", "session-a")[0].key, "authentication:network:203.0.113.20");
});

test("office staff polling together are not rate limited out of the portal", () => {
  // Simulates the request guard's token buckets: eight signed-in staff behind
  // one address, each polling the API three times a second for a minute.
  const profile = applicationRateProfile("/api/chat/messages", "GET");
  const buckets = new Map();
  let rejected = 0;
  for (let second = 0; second < 60; second += 1) {
    for (const bucket of buckets.values()) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + bucket.refillPerSecond);
    }
    for (let person = 0; person < 8; person += 1) {
      for (let request = 0; request < 3; request += 1) {
        const limits = rateLimitBuckets(profile, "203.0.113.20", `session-${person}`).map((limit) => {
          if (!buckets.has(limit.key)) buckets.set(limit.key, { ...limit, tokens: limit.capacity });
          return buckets.get(limit.key);
        });
        if (limits.every((bucket) => bucket.tokens >= 1)) limits.forEach((bucket) => { bucket.tokens -= 1; });
        else rejected += 1;
      }
    }
  }
  assert.equal(rejected, 0);
});

test("write bodies stay small except raw delivery chunks", () => {
  const MB = 1024 * 1024;
  assert.equal(mutationBodyLimit("/api/cdocs", "application/json", false), 2 * MB);
  assert.equal(mutationBodyLimit("/api/cdocs", "multipart/form-data; boundary=x", false), null);
  assert.equal(mutationBodyLimit("/login", "multipart/form-data; boundary=x", true), 512 * 1024);
  assert.equal(mutationBodyLimit(DELIVERY_CHUNK_PATH, "application/octet-stream", false), DELIVERY_CHUNK_MAX_BYTES);
  assert.equal(DELIVERY_CHUNK_MAX_BYTES, 48 * MB);
  // Only raw binary on the chunk route is widened.
  assert.equal(mutationBodyLimit(DELIVERY_CHUNK_PATH, "application/json", false), 2 * MB);
  assert.equal(mutationBodyLimit("/api/admin/clients/deliveries", "application/octet-stream", false), 2 * MB);
  assert.equal(mutationBodyLimit(`${DELIVERY_CHUNK_PATH}/x`, "application/octet-stream", false), 2 * MB);
});
