import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [migration, cmeetCreate, clientIncoming, clientRinger, cdrive, apiAdmin, apiCreate, directDelete, teamDelete, email, metrics, roomRoute, overview, clientCMeet, cmeetList, cmeetLinks] = await Promise.all([
  read("../glashdb/migrations/20260922_cmeet_api_cdrive_client_calls.sql"),
  read("../src/app/api/cmeet/route.ts"),
  read("../src/app/api/client/calls/incoming/route.ts"),
  read("../src/components/dashboard/ClientIncomingCallRinger.tsx"),
  read("../src/lib/cdrive.ts"),
  read("../src/app/api/admin/cmeet-api/route.ts"),
  read("../src/app/api/v1/cmeet/meetings/route.ts"),
  read("../src/app/api/chat/messages/[id]/actions/route.ts"),
  read("../src/app/api/team/chat/messages/[id]/route.ts"),
  read("../src/lib/email-from.ts"),
  read("../src/app/api/admin/platform-metrics/route.ts"),
  read("../src/app/api/cmeet/[code]/route.ts"),
  read("../src/app/(dashboard)/dashboard/page.tsx"),
  read("../src/components/dashboard/ClientCMeet.tsx"),
  read("../src/components/team/CMeetList.tsx"),
  read("../src/lib/cmeet-links.ts"),
]);

test("client calls are durable and ring until the client joins", () => {
  assert.match(migration, /cmeet_client_invitations/);
  assert.match(cmeetCreate, /invited_client_user_ids/);
  assert.match(clientIncoming, /invitation\.joined_at is null/);
  assert.match(clientRinger, /audio\.loop=true/);
  assert.match(clientRinger, /3_000|3000/);
});

test("cMeet exposes the current profile safely and the client overview includes studio and subscription actions", () => {
  assert.match(roomRoute, /avatar_url: "\/favicon\.png"/);
  assert.match(roomRoute, /avatar_url: actor\.avatarUrl/);
  assert.match(roomRoute, /avatar_url: account\.profile\.avatar_url/);
  assert.match(overview, /label: "Create studio"/);
  assert.match(overview, /label: "Subscription"/);
  assert.match(overview, /PenTool/);
  assert.match(overview, /CalendarRange/);
});

test("instant cMeet creation enters through the first-party auto-join route", () => {
  assert.match(cmeetLinks, /searchParams\.set\("join", "1"\)/);
  assert.match(clientCMeet, /router\.push\(buildCMeetAutoJoinPath\(meetingPath\)\)/);
  assert.match(cmeetList, /router\.push\(buildCMeetAutoJoinPath\(buildCMeetPath/);
});

test("cDrive keeps files private and grants explicit view or edit access", () => {
  assert.match(migration, /access_level text not null default 'view'/);
  assert.match(migration, /values \('client-drives', 'client-drives', false/);
  assert.match(cdrive, /createSignedUrl/);
  assert.match(cdrive, /CDRIVE_MAX_FILE_BYTES/);
});

test("cMeet API secrets are hashed, scoped, rate limited and shown once", () => {
  assert.match(apiAdmin, /createHash\("sha256"\)/);
  assert.match(apiAdmin, /notice:"Copy this key now/);
  assert.match(apiCreate, /rate_limit_per_minute/);
  assert.match(apiCreate, /Missing meetings:create scope/);
  assert.match(apiCreate, /hostUrl/);
  assert.doesNotMatch(migration, /secret\s+text/i);
});

test("only super admin deletion purges rows and attachments", () => {
  assert.match(directDelete, /actingAdmin\?\.role === "super_admin"/);
  assert.match(directDelete, /delete from public\.chat_messages/);
  assert.match(directDelete, /set deleted_at = now\(\)/);
  assert.match(teamDelete, /viewerIsSuperAdmin/);
  assert.match(teamDelete, /hardDeleted: true/);
  assert.match(teamDelete, /purgeChatAttachment/);
});

test("transactional mail defaults to immediate delivery and metrics are live", () => {
  assert.match(email, /EMAIL_NOTIFICATION_QUEUE === "on"/);
  assert.match(email, /cdsImmediateEmailTransport/);
  assert.match(metrics, /client_presence/);
  assert.match(metrics, /team_meetings/);
});
