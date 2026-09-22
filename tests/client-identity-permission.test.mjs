import { strict as assert } from "node:assert";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "node_modules/.cache/client-identity.test.cjs");
mkdirSync(path.dirname(bundle), { recursive: true });
execFileSync("npx", [
  "--yes", "esbuild@0.24.0", "src/lib/client-identity.ts",
  "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`,
  "--alias:@=./src", "--alias:server-only=./scripts/server-only-stub.js",
  "--log-level=error",
], { cwd: root, stdio: "inherit" });

const { canSeeClientIdentity, clientReference, maskClientRow, maskClientRows } = await import(bundle);

test("the super admin wildcard carries client identity", () => {
  assert.equal(canSeeClientIdentity(["all"]), true);
});

test("an explicit grant is what unlocks it", () => {
  assert.equal(canSeeClientIdentity(["clients.pii.view"]), true);
});

test("the whole Clients section does NOT imply seeing who the clients are", () => {
  // This is the rule the feature rests on. Granting a parent group normally
  // grants every child; identity is deliberately exempt.
  assert.equal(canSeeClientIdentity(["clients"]), false);
  assert.equal(canSeeClientIdentity(["clients.view", "clients.edit", "clients.export"]), false);
  assert.equal(canSeeClientIdentity(["finance", "finance.manage"]), false);
  assert.equal(canSeeClientIdentity(["projects", "orders", "deliveries"]), false);
  assert.equal(canSeeClientIdentity([]), false);
  assert.equal(canSeeClientIdentity(null), false);
});

test("a withheld row loses the email and phone entirely", () => {
  const row = maskClientRow(
    { id: "p1", name: "Website Redesign", client: "Nexxend Labs", client_email: "hi@nexxend.com", client_phone: "+234800" },
    false,
  );
  assert.equal(row.client_email, null);
  assert.equal(row.client_phone, null);
  assert.equal(row.name, "Website Redesign", "the project's own name is not client identity");
  assert.notEqual(row.client, "Nexxend Labs");
  assert.match(row.client, /^Client [0-9A-F]{4}$/);
});

test("an allowed row is returned untouched", () => {
  const original = { id: "p1", client: "Nexxend Labs", client_email: "hi@nexxend.com" };
  const row = maskClientRow(original, true);
  assert.equal(row, original, "the allowed path must not copy or mangle anything");
  assert.equal(row.client, "Nexxend Labs");
  assert.equal(row.client_email, "hi@nexxend.com");
});

test("the same client reads as the same reference everywhere", () => {
  // So an admin can still tell two projects apart and group them by client.
  const a = maskClientRow({ client: "Nexxend Labs" }, false);
  const b = maskClientRow({ client: "nexxend labs" }, false);
  const c = maskClientRow({ client: "Some Other Brand" }, false);
  assert.equal(a.client, b.client, "case and spacing must not change the reference");
  assert.notEqual(a.client, c.client, "different clients must read differently");
});

test("the reference does not leak the name it came from", () => {
  const masked = clientReference("Nexxend Labs");
  assert.equal(masked.toLowerCase().includes("nexxend"), false);
  assert.equal(masked.toLowerCase().includes("labs"), false);
});

test("a row with no client at all does not crash or invent one", () => {
  assert.equal(maskClientRow({ id: "p1", client: null }, false).client, null);
  assert.equal(clientReference(""), "Client");
  assert.equal(clientReference(undefined), "Client");
});

test("masking a list leaves the list shape alone", () => {
  const rows = maskClientRows([{ client: "A", client_email: "a@x.com" }, { client: "B" }], false);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].client_email, null);
  assert.notEqual(rows[0].client, rows[1].client);
});
