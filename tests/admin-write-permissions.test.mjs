import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const permissions = await readFile(new URL("../src/lib/admin-permissions.ts", import.meta.url), "utf8");
const apiSession = await readFile(new URL("../src/app/api/admin-check/route.ts", import.meta.url), "utf8");
const serverSession = await readFile(new URL("../src/lib/admin-session.ts", import.meta.url), "utf8");
const executiveApi = await readFile(new URL("../src/app/api/admin/executive-board/route.ts", import.meta.url), "utf8");

test("existing budget managers can write expansion budgets", () => {
  assert.match(permissions, /key === "executive_board\.expansion_budgets"/);
  assert.match(permissions, /permissions\.includes\("executive_board\.budgets"\)/);
});

test("sub-admin cookies refresh current member and role permissions", () => {
  for (const source of [apiSession, serverSession]) {
    assert.match(source, /left join public\.admin_roles/);
    assert.match(source, /member\.role_permissions/);
    assert.match(source, /member\.permissions/);
    assert.doesNotMatch(source, /return activeAdmin \? fromAdminCookie : null/);
  }
});

test("executive writes require their specific permission", () => {
  assert.match(executiveApi, /action\.includes\("expansion_budget"\)/);
  assert.match(executiveApi, /"executive_board\.expansion_budgets"/);
  assert.match(executiveApi, /"executive_board\.budgets"/);
  assert.match(executiveApi, /requireAdmin\(req, permission\)/);
});
