import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [adminPage, adminRoute, createServer] = await Promise.all([
  readFile("src/app/admin/create/page.tsx", "utf8"),
  readFile("src/app/api/admin/create/route.ts", "utf8"),
  readFile("src/lib/create-platform/server.ts", "utf8"),
]);

test("tool status uses a dedicated verified write instead of replacing the full tool", () => {
  assert.match(adminPage, /method: "PATCH"/);
  assert.match(adminPage, /JSON\.stringify\(\{ slug: tool\.slug, status \}\)/);
  assert.match(adminPage, /json\.tool\?\.status !== status/);
  assert.match(adminRoute, /updateCreateToolStatus\(body\.slug, body\.status\)/);
  assert.match(createServer, /update public\.create_tools[\s\S]+set status = \$2[\s\S]+where slug = \$1/);
  assert.match(createServer, /saved\.status !== status/);
});

test("admin settings never disguise a database read failure as seeded active statuses", () => {
  assert.match(createServer, /loadCreateToolsForAdmin/);
  assert.match(createServer, /Promise\.all\(\[loadCreateToolsForAdmin\(\), loadCreateAdvertBanner\(\)\]\)/);
  assert.match(adminRoute, /private, no-store, max-age=0/);
  assert.match(adminRoute, /status: 503/);
});

test("the status dropdown is optimistic, locked while saving, and rolls back on failure", () => {
  assert.match(adminPage, /statusSavingSlug/);
  assert.match(adminPage, /status: previousStatus/);
  assert.match(adminPage, /disabled=\{statusSavingSlug !== null\}/);
  assert.match(adminPage, /is now \$\{status\}/);
});

test("admins can explicitly choose free or credit-based usage pricing", () => {
  assert.match(adminPage, /"free" \| "credits"/);
  assert.match(adminPage, />Free<\/button>/);
  assert.match(adminPage, />Credit-based<\/button>/);
  assert.match(adminPage, /Credits per use/);
  assert.match(adminPage, /mode === "free" \? 0/);
  assert.match(createServer, /Number\.isInteger\(creditCost\)/);
  assert.match(createServer, /creditCost < 0 \|\| creditCost > 100000/);
});
