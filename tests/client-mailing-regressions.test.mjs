import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("client mailing has no generic client-update eyebrow", async () => {
  const [delivery, composer] = await Promise.all([
    read("src/lib/client-mailing-delivery.ts"),
    read("src/app/admin/clients/mailings/page.tsx"),
  ]);
  assert.doesNotMatch(delivery, /eyebrow:\s*"Client update"/);
  assert.doesNotMatch(composer, />Client update</);
});

test("campaign artwork is previewed through an authenticated stable route", async () => {
  const [delivery, upload, composer] = await Promise.all([
    read("src/lib/client-mailing-delivery.ts"),
    read("src/app/api/admin/clients/mailings/upload/route.ts"),
    read("src/app/admin/clients/mailings/page.tsx"),
  ]);
  assert.match(delivery, /\/api\/admin\/clients\/mailings\/upload\?path=/);
  assert.match(upload, /export async function GET/);
  assert.match(upload, /requireAdmin\(req, "clients\.mailings\.view"\)/);
  assert.match(upload, /storage\.from\(BUCKET\)\.download\(storagePath\)/);
  assert.match(composer, /"x-cds-silent": "1"/);
});

test("client message alerts resolve the human client name", async () => {
  const messages = await read("src/app/api/chat/messages/route.ts");
  assert.match(messages, /select\("full_name, company_name, email"\)/);
  assert.match(messages, /directoryClient\?\.display_name/);
  assert.match(messages, /subject: senderName/);
  assert.match(messages, /\["Client", senderName\]/);
});

test("global completion notices match only declared endpoint boundaries", async () => {
  const confirmations = await read("src/components/WriteConfirmations.tsx");
  assert.match(confirmations, /path === candidate\.prefix/);
  assert.match(confirmations, /candidate\.includeChildren/);
  assert.doesNotMatch(confirmations, /path\.startsWith\(candidate\.prefix\)/);
});
