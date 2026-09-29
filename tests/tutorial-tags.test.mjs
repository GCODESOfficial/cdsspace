import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("a tutorial can be filed under several tools, modules and pages", async () => {
  const [lib, api, manager] = await Promise.all([
    read("src/lib/tutorials.ts"),
    read("src/app/api/admin/tutorials/route.ts"),
    read("src/components/admin/tutorials/AdminTutorialManager.tsx"),
  ]);
  assert.match(lib, /normalizeTutorialTags/);
  // The first tag mirrors tool_slug, so nothing uploaded before tagging moves.
  assert.match(lib, /const toolSlug = tags\[0\]/);
  assert.match(api, /tags: form\.get\("tags"\)/);
  assert.match(manager, /form\.set\("tags", JSON\.stringify\(tags\)\)/);
});

test("a tutorial appears on every screen it is tagged with", async () => {
  const lib = await read("src/lib/tutorials.ts");
  assert.match(lib, /\$2 = any\(t\.tags\) or t\.tool_slug = \$2/);
});

test("the tag catalogue is unique and names real screens", async () => {
  const source = await read("src/lib/tutorial-targets.ts");
  const slugs = [...source.matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(slugs.length > 100, `expected the full platform catalogue, got ${slugs.length}`);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate slugs would file one tutorial twice");
  // The slugs tutorials were filed under before tagging must still resolve.
  for (const legacy of ["official-letterhead", "create-studio", "cdrive", "chat", "cmeet", "invoices"]) {
    assert.ok(slugs.includes(legacy), `${legacy} must stay in the catalogue`);
  }
});

test("the picker types ahead and clears the dialog it opens in", async () => {
  const picker = await read("src/components/admin/tutorials/TutorialTargetPicker.tsx");
  assert.match(picker, /searchTutorialTargets/);
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /aria-selected/);
  // Opened inside the upload dialog, so it uses the shared popover layer.
  assert.match(picker, /layer-popover/);
});
