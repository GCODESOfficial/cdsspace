import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [createRoute, clientCallRoute, clientCMeetRoute, approvalRoute, admissionRoute, iceRoute, signalRoute, translationRoute, meetClient, agendaRoute, migration] = await Promise.all([
  readFile(new URL("../src/app/api/cmeet/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/client/chat/call/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/client/cmeet/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/cmeet/[code]/approval/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/cmeet/[code]/admission/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/cmeet/[code]/ice-servers/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/cmeet/[code]/signal/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/cmeet/[code]/translation/session/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/meet/[code]/MeetClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/team/meetings/[code]/agenda/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../glashdb/migrations/20260914_cmeet_admin_approval.sql", import.meta.url), "utf8"),
]);

test("authenticated team and client-created cMeets open without a separate approval", () => {
  assert.match(createRoute, /requiresApproval = false/);
  assert.match(createRoute, /status: requiresApproval \? "pending_approval"/);
  assert.match(createRoute, /creatorMemberId/);
  assert.match(clientCallRoute, /approval_status: "approved"/);
  assert.match(clientCallRoute, /requires_approval: false/);
  assert.match(clientCMeetRoute, /created_by_client: resolved\.account\.user\.id/);
  assert.match(clientCMeetRoute, /status: scheduledFor \? "scheduled" : "live"/);
  assert.match(admissionRoute, /room\.created_by_client === account\.user\.id/);
  assert.match(admissionRoute, /room\.created_by === actorMemberId/);
  assert.match(admissionRoute, /role: "host" as const/);
  assert.match(approvalRoute, /actor\?\.kind !== "admin"/);
  assert.match(admissionRoute, /room\.approval_status !== "approved"/);
  assert.match(iceRoute, /room\.approval_status !== "approved"/);
  assert.match(signalRoute, /m\.approval_status = 'approved'/);
  assert.match(translationRoute, /room\.approval_status !== "approved"/);
  assert.match(migration, /check \(status in \('pending_approval', 'scheduled', 'live', 'ended', 'cancelled'\)\)/);
});

test("agenda items are meeting-scoped and rendered in open and discussed sections", () => {
  assert.match(createRoute, /team_meeting_agenda_items/);
  assert.match(agendaRoute, /\.eq\("meeting_id", meeting\.id\)/);
  assert.match(agendaRoute, /canParticipate/);
  assert.match(agendaRoute, /Join the meeting before viewing its agenda/);
  assert.match(meetClient, /title="To discuss"/);
  assert.match(meetClient, /title="Discussed"/);
  assert.match(meetClient, /line-through/);
});

test("screen capture saves a PNG and mobile capture starts with lighter video constraints", () => {
  assert.match(meetClient, /getDisplayMedia\(\{ video: true, audio: false \}\)/);
  assert.match(meetClient, /anchor\.download = `\$\{safeTitle\}/);
  assert.match(meetClient, /window\.matchMedia\("\(max-width: 767px\)"\)/);
  assert.match(meetClient, /compactVideo \? 640 : 960/);
});
