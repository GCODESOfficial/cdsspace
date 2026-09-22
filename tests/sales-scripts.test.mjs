import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync("src/app/api/admin/sales-scripts/route.ts", "utf8");
const page = readFileSync("src/app/admin/clients/sales-scripts/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260914_sales_scripts.sql", "utf8");
const sidebar = readFileSync("src/components/admin/AdminSidebar.tsx", "utf8");

test("Sales Hub exposes the sales scripts section", () => {
  assert.match(sidebar, /\/admin\/clients\/sales-scripts/);
  assert.match(page, /Sales scripts/);
});

test("the library covers all requested conversation categories", () => {
  for (const category of ["sales", "marketing", "client_experience"]) {
    assert.match(api, new RegExp(category));
    assert.match(migration, new RegExp(category));
  }
});

test("writes require permission and a trusted same-origin request", () => {
  assert.match(api, /clients\.sales_scripts\.edit/);
  assert.match(api, /assertTrustedMutationOrigin/);
});

test("unfinished scripts autosave as one server-side draft", () => {
  assert.match(page, /action: "save_draft"/);
  assert.match(migration, /one_draft_per_admin/);
  assert.match(migration, /source_script_id/);
});

test("approved scripts can be archived and restored", () => {
  assert.match(api, /action === "archive" \|\| action === "restore"/);
  assert.match(page, /changeStatus\(script, "archive"\)/);
  assert.match(page, /changeStatus\(script, "restore"\)/);
});
