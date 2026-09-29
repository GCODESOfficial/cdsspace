import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("cDrive migration adds explicit CDS Admin visibility and preserves admin-created drives", async () => {
  const sql = await read("glashdb/migrations/20260925_cdrive_admin_visibility.sql");
  assert.match(sql, /shared_with_admin boolean not null default false/i);
  assert.match(sql, /where created_by_kind = 'admin'/i);
  assert.match(sql, /set shared_with_admin = true/i);
});

test("admin cDrive routes list and open only admin-visible drives", async () => {
  const listRoute = await read("src/app/api/admin/clients/drives/route.ts");
  const detailRoute = await read("src/app/api/admin/clients/drives/[id]/route.ts");
  assert.match(listRoute, /where drive\.created_by_kind = 'admin' or drive\.shared_with_admin = true/i);
  assert.match(listRoute, /created_by_id, shared_with_admin\)/i);
  assert.match(listRoute, /'admin', \$4, true/i);
  assert.match(detailRoute, /and \(created_by_kind = 'admin' or shared_with_admin = true\)/i);
  assert.match(detailRoute, /const drive = await visibleDrive\(id\)/g);
});

test("clients control CDS Admin visibility during and after drive creation", async () => {
  const listRoute = await read("src/app/api/client/cdrive/route.ts");
  const detailRoute = await read("src/app/api/client/cdrive/[id]/route.ts");
  const page = await read("src/app/(dashboard)/dashboard/documents/page.tsx");
  assert.match(listRoute, /body\.shareWithAdmin === true/);
  assert.match(listRoute, /shared_with_admin\)/);
  assert.match(detailRoute, /export async function PATCH/);
  assert.match(detailRoute, /created_by_kind = 'client'/);
  assert.match(detailRoute, /created_by_id = \$2::text/);
  assert.match(page, /name="shareWithAdmin"/);
  assert.match(page, /Stop sharing with CDS Admin/);
  assert.match(page, /Private to you/);
});
