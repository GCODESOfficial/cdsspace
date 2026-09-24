import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(target);
  }
  return files;
}

test("product code does not use browser-native alert, confirm, or prompt dialogs", async () => {
  const files = await sourceFiles(path.join(root, "src"));
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/\bwindow\.(?:alert|confirm|prompt)\s*\(/.test(source)) offenders.push(path.relative(root, file));
  }
  assert.deepEqual(offenders, []);
});

test("cDrive shares stable tokenized routes through the universal share control", async () => {
  const page = await readFile(path.join(root, "src/app/(dashboard)/dashboard/documents/page.tsx"), "utf8");
  const detailRoute = await readFile(path.join(root, "src/app/api/client/cdrive/[id]/route.ts"), "utf8");
  const publicFileRoute = await readFile(path.join(root, "src/app/api/drive/[token]/files/[fileToken]/route.ts"), "utf8");
  assert.match(page, /UniversalShareButton/);
  assert.match(page, /url={`\/drive\/\$\{selected\.drive\.public_token\}`}/);
  assert.match(detailRoute, /select id, public_token/);
  assert.match(publicFileRoute, /drive\.public_token = \$1::uuid/);
  assert.doesNotMatch(publicFileRoute, /createSignedUrl/);
});

test("client storage is reserved from one combined server-side allowance", async () => {
  const storage = await readFile(path.join(root, "src/lib/client-storage.ts"), "utf8");
  const cdrive = await readFile(path.join(root, "src/lib/cdrive.ts"), "utf8");
  const create = await readFile(path.join(root, "src/lib/create-platform/server.ts"), "utf8");
  const createUi = await readFile(path.join(root, "src/components/create/CreateApp.tsx"), "utf8");
  assert.match(storage, /create_creations/);
  assert.match(storage, /client_drive_files/);
  assert.match(storage, /create_letterheads/);
  assert.match(storage, /client_storage_reservations/);
  assert.match(cdrive, /reserveClientStorage/);
  assert.match(create, /reserveClientStorage/);
  assert.doesNotMatch(createUi, /storageUsedBytes\)} \/ \{fmtBytes/);
});
