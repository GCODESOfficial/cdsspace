import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("team chat uses explicit task posts instead of link-based completion", async () => {
  const source = await read("src/components/chat/team-chat-panel.tsx");
  assert.match(source, /task_post/);
  assert.match(source, /Create a task post/);
  assert.match(source, /Mark done \/ compliant/);
  assert.match(source, /Task compliance/);
  assert.doesNotMatch(source, /isSocialEngagementPost/);
  assert.doesNotMatch(source, /Team completion/);
});

test("message actions expose delivery, seen, not-seen and offline status", async () => {
  const [panel, route] = await Promise.all([
    read("src/components/chat/team-chat-panel.tsx"),
    read("src/app/api/team/chat/messages/[id]/status/route.ts"),
  ]);
  assert.match(panel, /Delivery and seen status/);
  assert.match(panel, /Offline, not seen/);
  assert.match(route, /team_chat_message_receipts/);
  assert.match(route, /team_device_sessions/);
  assert.match(route, /"seen"/);
  assert.match(route, /"delivered"/);
  assert.match(route, /"not_seen"/);
  assert.match(route, /"offline"/);
  assert.match(route, /__task_compliant__/);
  assert.match(panel, /Done \/ compliant/);
});

test("notifications stay live in background and announce CDS Space", async () => {
  const [stream, hook, audio, teamBell] = await Promise.all([
    read("src/app/api/notifications/stream/route.ts"),
    read("src/hooks/use-notification-pulse.ts"),
    read("src/lib/platform-notification-client.ts"),
    read("src/components/team/NotificationBell.tsx"),
  ]);
  assert.match(stream, /text\/event-stream/);
  // The server decides when something changed, and only then sends an event,
  // so a quiet dashboard costs a phone nothing.
  assert.match(stream, /send\("pulse", stamp\)/);
  assert.match(stream, /stamp !== last/);
  assert.match(hook, /new EventSource/);
  // No client-side polling: the stream is the only thing that prompts a refetch.
  assert.doesNotMatch(hook, /setInterval/);
  // A hidden tab keeps its stream open; it is never disconnected on hide.
  assert.doesNotMatch(hook, /if \(document\.hidden\) \{?\s*source/);
  assert.match(audio, /special-notification\.mp3/);
  // Spaced letters: "CDS Space" is read by many voices as "CD Space".
  assert.match(audio, /SpeechSynthesisUtterance\("C D S Space"\)/);
  assert.match(teamBell, /useNotificationPulse\("team"/);
});

test("team chat creates receipts and notifies by push, never email", async () => {
  const route = await read("src/app/api/team/chat/messages/route.ts");
  assert.match(route, /insert into public\.team_chat_message_receipts/);
  assert.match(route, /sendPushToActor/);
  assert.match(route, /chat_task_post/);
  assert.doesNotMatch(route, /sendEmail|sendOrHoldNotificationEmail/);
});

test("only the poster and the super admin see who completed a task post", async () => {
  const [panel, status] = await Promise.all([
    read("src/components/chat/team-chat-panel.tsx"),
    read("src/app/api/team/chat/messages/[id]/status/route.ts"),
  ]);
  // A sub-admin sitting in the thread is one of the people being tracked.
  assert.match(status, /const isSuperAdmin = viewerIsSuperAdmin\(viewer\);/);
  assert.match(status, /if \(!isSuperAdmin && !ownsMessage\)/);
  assert.doesNotMatch(status, /viewer\.session\.is_sub_admin/);
  // The tally is part of the breakdown, so it is gated with it.
  assert.match(panel, /if \(viewer\?\.isSuperAdmin\) return true;/);
  assert.match(panel, /\{canInspectDelivery\(message\) && completionTotal > 0 && \(/);
  // Everyone still marks their own state.
  assert.match(panel, /Mark done \/ compliant/);
});
