import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/components/chat/admin-chat-panel.tsx", import.meta.url), "utf8");
const roomsApi = await readFile(new URL("../src/app/api/chat/rooms/route.ts", import.meta.url), "utf8");
const adviceApi = await readFile(new URL("../src/app/api/admin/chat/response-advice/route.ts", import.meta.url), "utf8");
const deliveries = await readFile(new URL("../src/app/admin/clients/deliveries/page.tsx", import.meta.url), "utf8");
const drives = await readFile(new URL("../src/components/deliveries/ProjectDriveManager.tsx", import.meta.url), "utf8");
const proposals = await readFile(new URL("../src/app/admin/deals/proposals/page.tsx", import.meta.url), "utf8");
const mailings = await readFile(new URL("../src/app/admin/clients/mailings/page.tsx", import.meta.url), "utf8");

test("admin client chat exposes contextual workflow actions", () => {
  for (const label of ["Send a delivery", "New project folder", "Send a proposal", "Send an email", "Response adviser"]) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /selectedClient &&/);
  assert.match(panel, /pathname: "\/admin\/clients\/deliveries"/);
  assert.match(panel, /pathname: "\/admin\/deals\/proposals"/);
  assert.match(panel, /pathname: "\/admin\/clients\/mailings"/);
});

test("client birthday enrichment is admin-only", () => {
  assert.match(roomsApi, /Birthday and CRM identity/);
  assert.match(roomsApi, /birthday: crm\?\.birthday/);
  assert.match(panel, /Birthday \{selectedClientBirthday\.date\}/);
  const adminBranch = roomsApi.indexOf("if (isAdmin)");
  const birthdayQuery = roomsApi.indexOf("select id, platform_user_id, email, brand_name, birthday");
  const clientBranch = roomsApi.indexOf("// Client: still just their own internal room.");
  assert.ok(adminBranch >= 0 && birthdayQuery > adminBranch && birthdayQuery < clientBranch);
});

test("response advice is grounded and protected", () => {
  assert.match(adviceApi, /getClientChatAdminActor\("messages\.view"\)/);
  assert.match(adviceApi, /assertTrustedMutationOrigin/);
  assert.match(adviceApi, /admin_sales_scripts/);
  assert.match(adviceApi, /listPricingLists\(\{ publishedOnly: true \}\)/);
  assert.match(adviceApi, /plan_pricing/);
  assert.match(adviceApi, /Never invent a price/);
  assert.match(panel, /Nothing is sent automatically/);
  assert.match(panel, /Add to message box/);
});

test("chat action destinations restore the selected client", () => {
  assert.match(deliveries, /params\.get\("action"\) !== "delivery"/);
  assert.match(drives, /params\.get\("action"\)!=="drive"/);
  assert.match(proposals, /params\.get\("action"\) !== "create"/);
  assert.match(mailings, /params\.get\("action"\) !== "compose"/);
});
