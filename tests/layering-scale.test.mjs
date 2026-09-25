import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = new URL("../src/", import.meta.url);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) files.push(...await walk(next));
    else if (/\.(tsx?|css)$/.test(entry.name)) files.push(next);
  }
  return files;
}

/**
 * One ladder decides what covers what. A hand-picked number always wins today
 * and loses tomorrow: pinning the accessibility panel to the maximum z-index
 * put it above select dropdowns, so its own language menu opened behind it.
 */
test("nothing outranks the shared layer scale with a hand-picked number", async () => {
  const files = await walk(ROOT);
  const offenders = [];
  for (const file of files) {
    const name = path.basename(file.pathname);
    if (name === "globals.css") continue; // defines the scale
    const source = await readFile(file, "utf8");
    for (const [, value] of source.matchAll(/z-\[(\d+)\]/g)) {
      if (Number(value) >= 1000) offenders.push(`${name}: z-[${value}]`);
    }
    for (const [, value] of source.matchAll(/z-index:\s*(\d+)/g)) {
      if (Number(value) >= 1000) offenders.push(`${name}: z-index ${value}`);
    }
  }
  assert.deepEqual(offenders, [], `use a layer-* class instead: ${offenders.join(", ")}`);
});

test("a dropdown always clears the dialog it is opened from", async () => {
  const [globals, a11y, select] = await Promise.all([
    readFile(new URL("app/globals.css", ROOT), "utf8"),
    readFile(new URL("app/a11y.css", ROOT), "utf8"),
    readFile(new URL("components/forms/DashboardSearchableSelects.tsx", ROOT), "utf8"),
  ]);
  const value = (name) => Number(globals.match(new RegExp(`--z-${name}:\\s*(\\d+)`))[1]);

  // The order that matters: a panel covers app modals, a raised dialog covers
  // that panel, and a popover covers everything that can contain one.
  assert.ok(value("modal") < value("a11y"), "the accessibility panel must clear app modals");
  assert.ok(value("a11y") < value("modal-top"), "a confirm raised from the panel must clear it");
  assert.ok(value("modal-top") < value("popover"), "a dropdown must clear a raised dialog");
  assert.ok(value("popover") < value("toast"), "a toast stays visible above a popover");

  assert.match(a11y, /z-index: var\(--z-a11y/);
  assert.match(select, /layer-popover/);
});
