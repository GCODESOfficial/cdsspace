import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [migration, defaults, server, page, sessionGuard, permissions, sidebar] =
  await Promise.all([
    readFile(
      "glashdb/migrations/20260923_admin_equipment_inventory.sql",
      "utf8",
    ),
    readFile(
      "glashdb/migrations/20260924_admin_equipment_default_types.sql",
      "utf8",
    ),
    readFile("src/app/api/admin/equipment/route.ts", "utf8"),
    readFile("src/app/admin/equipment-inventory/page.tsx", "utf8"),
    readFile("src/lib/equipment-inventory.ts", "utf8"),
    readFile("src/lib/admin-permissions.ts", "utf8"),
    readFile("src/components/admin/AdminSidebar.tsx", "utf8"),
  ]);

test("equipment records and assignments have stable database ownership", () => {
  assert.match(
    migration,
    /assigned_team_member_id uuid references public\.team_members\(id\)/i,
  );
  assert.match(
    migration,
    /admin_equipment_assignments[\s\S]+team_member_id uuid not null references public\.team_members\(id\)/i,
  );
  assert.match(migration, /admin_equipment_one_open_assignment/i);
  assert.match(server, /for update/i);
  assert.match(server, /returned_at=now\(\)/i);
});

test("passwords are encrypted, excluded from drafts, permission checked and audited", () => {
  assert.match(sessionGuard, /aes-256-gcm/i);
  assert.match(sessionGuard, /cleanEquipmentSecret/);
  assert.match(sessionGuard, /EQUIPMENT_PASSWORD_ENCRYPTION_KEY/);
  assert.match(
    page,
    /password: _password,[\s\S]+clearPassword: _clearPassword,[\s\S]+\.\.\.safeDraft/,
  );
  assert.match(server, /password_ciphertext/);
  assert.match(permissions, /equipment_inventory\.credentials/);
  assert.match(migration, /admin_equipment_audit/);
});

test("receipts use authenticated private storage", () => {
  assert.match(migration, /equipment-private[\s\S]+false/i);
  assert.match(migration, /revoke all on table/i);
  assert.match(page, /\/api\/admin\/equipment\/receipt/);
});

test("inventory is navigable, permissioned, autosaved and has managed types", () => {
  assert.match(sidebar, /Equipment Inv/);
  assert.match(sidebar, /\/admin\/equipment-inventory/);
  assert.match(permissions, /key: "equipment_inventory"/);
  assert.match(page, /action: "save_draft"/);
  assert.match(page, /Manage types/);
  assert.match(defaults, /Laptop/);
});
