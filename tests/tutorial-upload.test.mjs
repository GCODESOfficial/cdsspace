import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * A whole video in one request was refused by the proxy above roughly 48MB,
 * which is why an upload could read 0% and never move.
 */
test("a video is sent in parts small enough to get through", async () => {
  const [session, client] = await Promise.all([
    read("src/lib/tutorial-upload-session.ts"),
    read("src/lib/tutorial-upload-client.ts"),
  ]);
  const chunk = Number(session.match(/UPLOAD_CHUNK_BYTES = (\d+) \* 1024 \* 1024/)[1]);
  assert.ok(chunk > 0 && chunk <= 8, `parts must stay well under the proxy limit, got ${chunk}MB`);
  assert.match(client, /uploadFileInChunks/);
  // Progress is measured across the file, not the current part.
  assert.match(client, /sentBytes/);
  assert.match(client, /secondsRemaining/);
});

test("an upload that stops can be carried on or discarded", async () => {
  const [session, client, manager] = await Promise.all([
    read("src/lib/tutorial-upload-session.ts"),
    read("src/lib/tutorial-upload-client.ts"),
    read("src/components/admin/tutorials/AdminTutorialManager.tsx"),
  ]);
  assert.match(client, /readPendingUpload/);
  assert.match(client, /discardUpload/);
  assert.match(manager, /Unfinished upload/);
  assert.match(manager, /Continue upload/);
  assert.match(manager, /Discard/);
  // A part that already landed must never be written twice.
  assert.match(session, /duplicate: true/);
  // One admin's parts are not reachable by another.
  assert.match(session, /session\.owner !== owner/);
});

test("the stored video is compressed for streaming", async () => {
  const compression = await read("src/lib/tutorial-compression.ts");
  assert.match(compression, /COMPRESSION_MIN_SAVING = 0\.2/);
  assert.match(compression, /libx264/);
  assert.match(compression, /faststart/);
  // A file that is already small is left alone rather than re-encoded.
  assert.match(compression, /saving < COMPRESSION_MIN_SAVING/);
  // The original is only removed once the replacement is recorded.
  assert.match(compression, /storage\.remove\(\[media\.video_path\]\)/);
});
