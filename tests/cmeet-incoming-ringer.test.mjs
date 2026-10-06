import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [teamChat, createRoute, incomingRoute, ringer, teamLayout, adminLayout, meetClient, clientCMeetRoute, clientChatCallRoute, adminIncomingRoute, clientCallNotifier, adminAlerts] = await Promise.all([
  readFile(new URL("../src/components/chat/team-chat-panel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/cmeet/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/team/calls/incoming/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/team/IncomingCallRinger.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/team/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/admin/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/meet/[code]/MeetClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/client/cmeet/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/client/chat/call/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/admin/calls/incoming/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/client-cmeet-notifications.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/admin-alerts.ts", import.meta.url), "utf8"),
]);

test("instant conversation calls inherit the thread roster", () => {
  assert.match(teamChat, /source_thread_id: currentThread\.id/);
  assert.match(createRoute, /team_chat_participants/);
  assert.match(createRoute, /new Set\(requestedIds\)/);
  assert.match(createRoute, /Incoming \$\{data\.audio_only \? "audio" : "video"\} call/);
});

test("only live unjoined instant calls are returned to the recipient", () => {
  assert.match(incomingRoute, /\.is\("joined_at", null\)/);
  assert.match(incomingRoute, /\.eq\("status", "live"\)/);
  assert.match(incomingRoute, /\.is\("scheduled_for", null\)/);
  assert.match(incomingRoute, /meeting\.created_by !== session\.id/);
});

test("team and admin shells ring continuously and joining records presence", () => {
  assert.match(teamLayout, /<IncomingCallRinger \/>/);
  assert.match(adminLayout, /<IncomingCallRinger endpoint="\/api\/admin\/calls\/incoming" \/>/);
  assert.match(ringer, /audio\.loop = true/);
  assert.match(ringer, /POLL_INTERVAL_MS = 3_000/);
  assert.match(ringer, /Turn on ringtone/);
  assert.match(ringer, /Join call/);
  assert.match(meetClient, /body: JSON\.stringify\(\{ action: "join" \}\)/);
});

test("every instant client-created cMeet rings admins without sending email", () => {
  for (const route of [clientCMeetRoute, clientChatCallRoute]) {
    assert.match(route, /if \(!scheduledFor\)/);
    assert.match(route, /cmeet_staff_invitations/);
    assert.match(route, /notifyClientCMeetStarted/);
    assert.match(route, /after\(async \(\) =>/);
  }
  assert.match(adminIncomingRoute, /cmeet_staff_invitations/);
  assert.match(adminIncomingRoute, /meeting\.scheduled_for is null/);
  assert.match(adminIncomingRoute, /buildCMeetAutoJoinPath/);
  assert.match(clientCallNotifier, /kind: "client_call"/);
  assert.match(clientCallNotifier, /Join the live cMeet/);
  // Calls ring phones and the admin shell; they are not emailed.
  assert.match(adminAlerts, /input\.kind === "client_call"\) return 0;/);
});
