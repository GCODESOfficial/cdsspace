import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const permissions = await readFile(new URL("../src/lib/admin-permissions.ts", import.meta.url), "utf8");
const apiSession = await readFile(new URL("../src/app/api/admin-check/route.ts", import.meta.url), "utf8");
const serverSession = await readFile(new URL("../src/lib/admin-session.ts", import.meta.url), "utf8");
const executiveApi = await readFile(new URL("../src/app/api/admin/executive-board/route.ts", import.meta.url), "utf8");
const executiveClient = await readFile(new URL("../src/components/admin/executive-board/ExecutiveBoardApp.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("../src/components/admin/AdminSidebar.tsx", import.meta.url), "utf8");
const picker = await readFile(new URL("../src/components/admin/SubAdminPermissionsPicker.tsx", import.meta.url), "utf8");

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

test("executive reads use the permission for the requested board page", () => {
  for (const permission of [
    "executive_board.view",
    "executive_board.budgets",
    "executive_board.expansion_budgets",
    "executive_board.targets",
    "executive_board.models",
    "executive_board.vault_view",
  ]) {
    assert.match(executiveApi, new RegExp(permission.replaceAll(".", "\\.")));
  }
  assert.match(executiveApi, /requireAdmin\(req, VIEW_PERMISSION\[view\]\)/);
  assert.match(executiveClient, /executive-board\?view=\$\{encodeURIComponent\(view\)\}/);
});

test("permission catalogue follows the restructured admin navigation", () => {
  assert.match(permissions, /export const PERMISSION_SECTIONS/);
  for (const group of [
    "clients_directory",
    "clients_mailings",
    "executive_board_overview",
    "executive_board_budgets",
    "executive_board_expansion_budgets",
    "executive_board_targets",
    "executive_board_models",
    "executive_board_letterhead",
    "executive_board_vault",
  ]) {
    assert.match(permissions, new RegExp(`key: "${group}"`));
  }
  assert.match(picker, /PERMISSION_SECTIONS/);
  assert.match(sidebar, /permission: "executive_board\.letterhead_view"/);
  assert.match(sidebar, /permission: "executive_board\.vault_view"/);
});
