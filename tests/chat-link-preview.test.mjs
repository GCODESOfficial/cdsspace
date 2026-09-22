import { strict as assert } from "node:assert";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "node_modules/.cache/message-links.test.cjs");
mkdirSync(path.dirname(bundle), { recursive: true });
execFileSync("npx", [
  "--yes", "esbuild@0.24.0", "src/components/chat/message-links.tsx",
  "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`,
  "--alias:@=./src", "--external:react", "--external:next/link", "--log-level=error",
], { cwd: root, stdio: "inherit" });

const { firstUrl, isMeetingLink } = await import(bundle);

/** Mirrors absoluteTarget in message-links: what actually reaches the preview API. */
function absoluteTarget(url, origin = "https://cdsspace.pro") {
  try {
    return new URL(url, origin).toString();
  } catch {
    return null;
  }
}

test("a meeting link stored as a bare path is still found in the message", () => {
  // This is exactly how client chat stores them, per the thread on screen.
  const body = "🎥 Video call started - join: /meet/bold-space-62/video-call-cds-space";
  assert.equal(firstUrl(body), "/meet/bold-space-62/video-call-cds-space");
});

test("that bare path becomes something the preview service can fetch", () => {
  // Sent unresolved it came back "invalid url" and the card never appeared,
  // which is why the same link previewed in team chat and not in client chat.
  const relative = firstUrl("join: /meet/bold-space-62/video-call-cds-space");
  assert.equal(absoluteTarget(relative), "https://cdsspace.pro/meet/bold-space-62/video-call-cds-space");
});

test("an absolute link is left exactly as it is", () => {
  const body = "join: https://cdsspace.pro/meet/clever-cloud-27/video-call-family-house";
  const found = firstUrl(body);
  assert.equal(found, "https://cdsspace.pro/meet/clever-cloud-27/video-call-family-house");
  assert.equal(absoluteTarget(found), found);
});

test("a document link shared into chat resolves too", () => {
  const found = firstUrl("Brand guide: https://cdsspace.pro/cdocs/abc123");
  assert.equal(absoluteTarget(found), "https://cdsspace.pro/cdocs/abc123");
});

test("resolution follows whichever origin the reader is on", () => {
  assert.equal(
    absoluteTarget("/meet/calm-cloud-40/video-call-godsgift-etuk", "http://localhost:3000"),
    "http://localhost:3000/meet/calm-cloud-40/video-call-godsgift-etuk",
  );
});

test("junk never reaches the preview service as a bad request", () => {
  assert.equal(absoluteTarget("not a url at all", "not a base"), null);
  assert.equal(firstUrl(""), null);
  assert.equal(firstUrl(null), null);
});

test("meeting links are still recognised as meetings either way", () => {
  assert.equal(isMeetingLink("/meet/bold-space-62/video-call-cds-space"), true);
  assert.equal(isMeetingLink("https://cdsspace.pro/meet/clever-cloud-27/video-call-family-house"), true);
  assert.equal(isMeetingLink("https://cdsspace.pro/cdocs/abc123"), false);
});
