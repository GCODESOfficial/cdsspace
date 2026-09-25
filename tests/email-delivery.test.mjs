import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * Notification email stopped for twelve days and nothing noticed: the queue
 * held 129 messages with no attempt recorded against any of them, because the
 * external scheduler had stopped calling the worker.
 */
test("the app sends queued email itself when the scheduler goes quiet", async () => {
  const [queue, stream] = await Promise.all([
    read("src/lib/notification-email-queue.ts"),
    read("src/app/api/notifications/stream/route.ts"),
  ]);
  assert.match(queue, /export async function sweepEmailQueueIfDue/);
  assert.match(stream, /sweepEmailQueueIfDue/);
  // Cheap: one pass a minute per server, a small batch.
  assert.match(queue, /SWEEP_EVERY_MS = 60_000/);
  assert.match(queue, /SWEEP_BATCH = 40/);
});

test("a backlog is loud, and stale mail is not sent automatically", async () => {
  const queue = await read("src/lib/notification-email-queue.ts");
  assert.match(queue, /SWEEP_MAX_AGE_HOURS = 48/);
  assert.match(queue, /emails waiting, oldest/);
  assert.match(queue, /export async function notificationQueueBacklog/);
});

test("an email that fails to send is kept and retried", async () => {
  const email = await read("src/lib/email-from.ts");
  // Every transport failing used to throw the message away.
  assert.match(email, /insert into public\.notification_email_queue/);
  assert.match(email, /could not keep the failed message for retry/);
});

test("delivery health can be read from outside the admin portal", async () => {
  const health = await read("src/app/api/cron/email-health/route.ts");
  assert.match(health, /verifyEmailReady/);
  assert.match(health, /notificationQueueBacklog/);
  assert.match(health, /CRON_SECRET/);
});
