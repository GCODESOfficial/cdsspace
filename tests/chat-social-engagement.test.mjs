import { strict as assert } from "node:assert";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(
  root,
  "node_modules/.cache/chat-social-engagement.test.cjs",
);
mkdirSync(path.dirname(bundle), { recursive: true });
execFileSync(
  "npx",
  [
    "--yes",
    "esbuild@0.24.0",
    "src/lib/chat-social-engagement.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    `--outfile=${bundle}`,
    "--log-level=error",
  ],
  { cwd: root, stdio: "inherit" },
);

const { isSocialEngagementPost } = await import(bundle);

test("multiple social links create a completion checklist", () => {
  assert.equal(
    isSocialEngagementPost(`Last post is up for today.
https://www.facebook.com/share/example
https://www.instagram.com/p/example
https://x.com/cdsspace/status/example`),
    true,
  );
});

test("one social link qualifies when the message asks for engagement", () => {
  assert.equal(
    isSocialEngagementPost(
      "Please like and comment: https://www.linkedin.com/posts/example",
    ),
    true,
  );
});

test("ordinary links and a single neutral social link stay ordinary", () => {
  assert.equal(
    isSocialEngagementPost("Review https://cdsspace.pro/cdocs/example"),
    false,
  );
  assert.equal(
    isSocialEngagementPost("Reference: https://www.youtube.com/watch?v=example"),
    false,
  );
});
