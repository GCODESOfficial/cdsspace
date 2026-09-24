import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * The site runs as one Node process. Anything that holds a request open, or
 * opens an unbounded number of connections, can take the whole site down
 * rather than degrade one feature. These guards keep each of those bounded.
 */
test("the notification stream is capped and can be switched off", async () => {
  const stream = await read("src/app/api/notifications/stream/route.ts");
  assert.match(stream, /NOTIFICATIONS_STREAM/);
  assert.match(stream, /MAX_STREAMS/);
  assert.match(stream, /cdsOpenNotificationStreams/);
  // One shared answer per person, not one query per open tab.
  assert.match(stream, /stampCache/);
  // Refusing must be a plain 204 so the client quietly falls back to polling.
  assert.match(stream, /status: 204/);
});

test("a refused stream still leaves notifications arriving", async () => {
  const hook = await read("src/hooks/use-notification-pulse.ts");
  assert.match(hook, /baseline/);
  assert.match(hook, /20_000/);
  // A server refusing streams must not be retried every few seconds.
  assert.match(hook, /120_000/);
});

test("a stalled email can never hold a request open", async () => {
  const email = await read("src/lib/email-from.ts");
  assert.match(email, /EMAIL_SEND_TIMEOUT_MS/);
  assert.match(email, /withSendTimeout/);
  // A burst of notifications must not open a socket per message.
  assert.match(email, /EMAIL_MAX_IN_FLIGHT/);
  assert.match(email, /withSendSlot/);
});

test("chat does not wait for delivery before answering the sender", async () => {
  const chat = await read("src/app/api/team/chat/messages/route.ts");
  assert.match(chat, /void Promise\.allSettled/);
});
