import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard native selects open one reusable searchable option picker", async () => {
  const component = await read("src/components/forms/DashboardSearchableSelects.tsx");
  const layout = await read("src/app/layout.tsx");

  assert.match(component, /Search options\.\.\./);
  assert.match(component, /document\.addEventListener\("pointerdown"/);
  assert.match(component, /select\.dispatchEvent\(new Event\("change"/);
  assert.match(component, /\/admin[\s\S]*\/team[\s\S]*\/marketer[\s\S]*\/dashboard/);
  assert.match(component, /dataset\.searchable === "false"/);
  assert.match(component, /element\.multiple/);
  assert.match(layout, /<DashboardSearchableSelects \/>/);
});

test("the searchable picker supports mobile, keyboard and empty search states", async () => {
  const component = await read("src/components/forms/DashboardSearchableSelects.tsx");

  assert.match(component, /viewportWidth < 640/);
  assert.match(component, /event\.key === "ArrowDown"/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /No matching options found\./);
  assert.match(component, /role="listbox"/);
});
