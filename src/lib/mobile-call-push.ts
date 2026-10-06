import "server-only";

import { createHmac, createPrivateKey, sign, timingSafeEqual } from "node:crypto";
import http2 from "node:http2";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbServiceRoleConfig } from "@/lib/glashdb/env";
import { absolutePublicUrl } from "@/lib/public-site";
import { CALL_RING_SECONDS } from "@/lib/cmeet-call-handling";
import { callShapes } from "@/lib/cmeet-call-roster";

/**
 * Rings phones for cMeet calls while the CDS Space app is closed, the way
 * WhatsApp does:
 *  - Android: a high-priority data message through the Expo push service. The
 *    app's background task shows a full-screen incoming-call notification
 *    (Accept / Decline, ringtone, over the lock screen).
 *  - iPhone: an APNs VoIP (PushKit) push. The app reports it to CallKit, which
 *    shows the phone's own incoming-call screen.
 * When the call is answered, declined or ends, Android phones get a cancel
 * message; iPhones end the CallKit call themselves (the app checks the call
 * while it rings, and gives up after the ring time).
 *
 * Configuration (server environment):
 *  - EXPO_ACCESS_TOKEN   optional; only if "enhanced push security" is on in Expo.
 *  - APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (the .p8 key text; "\n" escapes
 *    are accepted), APNS_BUNDLE_ID (default pro.cdsspace.app). Without them,
 *    iPhones are not rung while the app is closed.
 * Every send is best effort: a failure never affects the call itself.
 */

type Device = { id: string; subject_key: string; portal: "client" | "team" | "admin"; platform: "android" | "ios"; token_kind: "expo" | "voip"; token: string };

export type IncomingCallPush = {
  kind: "incoming-call";
  id: string;
  code: string;
  title: string;
  audioOnly: boolean;
  callerName: string;
  /** The caller's profile photo (absolute URL), when they have one. */
  callerAvatar: string | null;
  group: boolean;
  participantCount: number;
  portal: "client" | "team" | "admin";
  startedAt: string;
  ringSeconds: number;
  declineUrl: string;
};

// ─── Decline links (the phone declines from its lock screen, without a session) ──

const DECLINE_TTL_SECONDS = CALL_RING_SECONDS + 600;

function declineSignature(meetingId: string, subject: string, expires: number) {
  return createHmac("sha256", getGlashDbServiceRoleConfig().serviceRoleKey)
    .update(`cds-cmeet-push-decline:${meetingId}:${subject}:${expires}`)
    .digest("base64url");
}

function declineToken(meetingId: string, subject: string) {
  const expires = Math.floor(Date.now() / 1000) + DECLINE_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ m: meetingId, s: subject, e: expires })).toString("base64url");
  return `${payload}.${declineSignature(meetingId, subject, expires)}`;
}

/** The signed link a phone declines with (no session needed), for the person `subject`. */
export function declineUrlFor(meetingId: string, subject: string) {
  return absolutePublicUrl(`/api/mobile/v1/calls/decline?t=${encodeURIComponent(declineToken(meetingId, subject))}`);
}

/** { meetingId, subject } when the token is genuine and unexpired, otherwise null. */
export function verifyDeclineToken(token: string) {
  const [payload, supplied] = String(token || "").split(".");
  if (!payload || !supplied) return null;
  try {
    const { m, s, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof m !== "string" || typeof s !== "string" || !Number.isInteger(e) || e <= Math.floor(Date.now() / 1000)) return null;
    const expected = Buffer.from(declineSignature(m, s, e));
    const given = Buffer.from(supplied);
    return expected.length === given.length && timingSafeEqual(expected, given) ? { meetingId: m, subject: s } : null;
  } catch {
    return null;
  }
}

// ─── Who to ring ────────────────────────────────────────────────────────────

type Recipient = {
  subjects: string[];
  portalCaller: (portal: Device["portal"]) => string;
  portalAvatar: (portal: Device["portal"]) => string | null;
};

// Stored photos may be site paths ("/uploads/…"): phones need the full address.
export const absoluteAvatarUrl = (value: string | null | undefined) => {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return text.startsWith("/") ? absolutePublicUrl(text) : null;
};

async function recipientsFor(meetingId: string) {
  const meeting = await glashMaybeOne<{
    id: string;
    room_code: string;
    title: string;
    audio_only: boolean;
    started_at: string;
    created_by_admin: boolean;
    creator_name: string | null;
    creator_avatar: string | null;
    client_name: string | null;
    client_avatar: string | null;
    live: boolean;
  }>(
    `select meeting.id::text, meeting.room_code, meeting.title, meeting.audio_only,
            coalesce(meeting.started_at, meeting.created_at)::text as started_at,
            meeting.created_by_admin,
            creator.full_name as creator_name,
            creator.avatar_url as creator_avatar,
            coalesce(client.full_name, client.company_name, client.email) as client_name,
            client.avatar_url as client_avatar,
            (meeting.status = 'live' and meeting.scheduled_for is null and meeting.ended_at is null) as live
       from public.team_meetings meeting
       left join public.team_members creator on creator.id = meeting.created_by
       left join public.profiles client on client.id = meeting.created_by_client
      where meeting.id = $1::uuid`,
    [meetingId],
  );
  if (!meeting?.live) return null;

  const people = await glashQuery<{ subject: string }>(
    `select 'team:' || participant.team_member_id::text as subject
       from public.team_meeting_participants participant
       join public.team_meetings meeting on meeting.id = participant.meeting_id
      where participant.meeting_id = $1::uuid and participant.joined_at is null
        and participant.team_member_id is distinct from meeting.created_by
        and not exists (select 1 from public.cmeet_call_actions action
                         where action.meeting_id = participant.meeting_id
                           and action.actor_key = participant.team_member_id::text and action.action = 'declined')
     union
     -- A sub-admin signed in to the admin portal is rung there too (as /api/admin/calls/incoming).
     select 'admin:' || participant.team_member_id::text
       from public.team_meeting_participants participant
       join public.team_meetings meeting on meeting.id = participant.meeting_id
      where participant.meeting_id = $1::uuid and participant.joined_at is null
        and participant.team_member_id is distinct from meeting.created_by
        and not exists (select 1 from public.cmeet_call_actions action
                         where action.meeting_id = participant.meeting_id
                           and action.actor_key = participant.team_member_id::text)
     union
     select 'client:' || invitation.client_user_id::text
       from public.cmeet_client_invitations invitation
      where invitation.meeting_id = $1::uuid and invitation.joined_at is null and invitation.dismissed_at is null`,
    [meetingId],
  );
  const staff = await glashMaybeOne<{ waiting: boolean }>(
    `select true as waiting from public.cmeet_staff_invitations where meeting_id = $1::uuid and joined_at is null limit 1`,
    [meetingId],
  );

  const callerForStaff = meeting.client_name || meeting.creator_name || (meeting.created_by_admin ? "Super admin" : "CDS Space");
  const recipient: Recipient = {
    subjects: people.map((person) => person.subject),
    // Clients see the company calling; staff see the person.
    portalCaller: (portal) => (portal === "client" ? (meeting.created_by_admin ? "CDS Space" : "CDS Space team") : callerForStaff),
    // Clients see CDS Space: the calling admin's photo, else the CDS Space logo.
    // Staff see the caller's photo (the logo for the super admin, who has none).
    portalAvatar: (portal) => {
      const brand = meeting.created_by_admin ? absoluteAvatarUrl("/favicon.png") : null;
      if (portal === "client") return absoluteAvatarUrl(meeting.creator_avatar) || absoluteAvatarUrl("/favicon.png");
      return absoluteAvatarUrl(meeting.client_avatar || meeting.creator_avatar) || brand;
    },
  };
  return { meeting, recipient, staffWaiting: Boolean(staff?.waiting) };
}

// One phone signed in to several portals (a sub-admin: team and admin) is
// registered once per portal with the same token. It must get ONE call push:
// two at once start the app's background handler twice and neither rings.
// A team call is answered as a team member, so the team portal comes first.
const PORTAL_ORDER: Record<Device["portal"], number> = { team: 0, admin: 1, client: 2 };
function onePerPhone(devices: Device[]) {
  const byToken = new Map<string, Device>();
  for (const device of devices) {
    const kept = byToken.get(device.token);
    if (!kept || PORTAL_ORDER[device.portal] < PORTAL_ORDER[kept.portal]) byToken.set(device.token, device);
  }
  return [...byToken.values()];
}

async function devicesFor(subjects: string[], includeCallTakingAdmins: boolean) {
  if (!subjects.length && !includeCallTakingAdmins) return [];
  const devices = await glashQuery<Device>(
    // Calls ring Android through its Expo token and iPhone through VoIP only (an
    // iPhone's Expo token is for ordinary notifications: lib/mobile-push.ts).
    `select id::text, subject_key, portal, platform, token_kind, token
       from public.mobile_push_devices
      where (token_kind = 'voip' or platform = 'android')
        and (subject_key = any($1::text[])
             or ($2::boolean and portal = 'admin' and takes_client_calls))`,
    [subjects, includeCallTakingAdmins],
  ).catch(() => [] as Device[]);
  return onePerPhone(devices);
}

// Everyone a call rang, answered or not (to stop it on all their phones).
async function everyoneRung(meetingId: string) {
  const rows = await glashQuery<{ subject: string }>(
    `select 'team:' || participant.team_member_id::text as subject
       from public.team_meeting_participants participant where participant.meeting_id = $1::uuid
     union
     select 'admin:' || participant.team_member_id::text
       from public.team_meeting_participants participant where participant.meeting_id = $1::uuid
     union
     select 'client:' || invitation.client_user_id::text
       from public.cmeet_client_invitations invitation where invitation.meeting_id = $1::uuid`,
    [meetingId],
  ).catch(() => []);
  const staff = await glashMaybeOne<{ found: boolean }>(
    `select true as found from public.cmeet_staff_invitations where meeting_id = $1::uuid limit 1`,
    [meetingId],
  ).catch(() => null);
  return { subjects: rows.map((row) => row.subject), staff: Boolean(staff?.found) };
}

// ─── Senders ────────────────────────────────────────────────────────────────

async function forgetDevices(ids: string[]) {
  if (!ids.length) return;
  await glashQuery(`delete from public.mobile_push_devices where id = any($1::uuid[])`, [ids]).catch(() => undefined);
}

async function sendExpo(messages: { device: Device; data: Record<string, unknown> }[]) {
  // The Expo push service takes up to 100 messages a request.
  for (let start = 100; start < messages.length; start += 100) await sendExpo(messages.slice(start, start + 100));
  messages = messages.slice(0, 100);
  if (!messages.length) return;
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  // Data only (no title or body): the app's background task decides what to show.
  const body = messages.map(({ device, data }) => ({ to: device.token, data, priority: "high", ttl: CALL_RING_SECONDS }));
  const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers, body: JSON.stringify(body) });
  const result = (await response.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
  const gone = (result?.data || [])
    .map((ticket, index) => (ticket?.details?.error === "DeviceNotRegistered" ? messages[index]?.device.id : null))
    .filter((id): id is string => Boolean(id));
  await forgetDevices(gone);
}

let apnsJwt: { value: string; at: number } | null = null;

function apnsConfig() {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const key = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!keyId || !teamId || !key) return null;
  return { keyId, teamId, key, topic: `${process.env.APNS_BUNDLE_ID || "pro.cdsspace.app"}.voip` };
}

function apnsToken(config: NonNullable<ReturnType<typeof apnsConfig>>) {
  // Apple accepts a provider token for an hour; renew well before that.
  if (apnsJwt && Date.now() - apnsJwt.at < 45 * 60_000) return apnsJwt.value;
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: config.keyId })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(config.key),
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  apnsJwt = { value: `${header}.${claims}.${signature}`, at: Date.now() };
  return apnsJwt.value;
}

function apnsSend(host: string, config: NonNullable<ReturnType<typeof apnsConfig>>, token: string, payload: string) {
  return new Promise<{ status: number; reason?: string }>((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on("error", () => resolve({ status: 0 }));
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsToken(config)}`,
      "apns-topic": config.topic,
      "apns-push-type": "voip",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
    });
    let status = 0;
    let text = "";
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    request.on("data", (chunk) => {
      text += chunk;
    });
    request.on("end", () => {
      client.close();
      let reason: string | undefined;
      try {
        reason = text ? JSON.parse(text).reason : undefined;
      } catch {
        reason = undefined;
      }
      resolve({ status, reason });
    });
    request.on("error", () => {
      client.close();
      resolve({ status: 0 });
    });
    request.setTimeout(10_000, () => request.close());
    request.end(payload);
  });
}

async function sendVoip(messages: { device: Device; data: Record<string, unknown> }[]) {
  const config = apnsConfig();
  if (!config || !messages.length) return;
  const gone: string[] = [];
  await Promise.all(
    messages.map(async ({ device, data }) => {
      const payload = JSON.stringify({ aps: {}, ...data });
      // App Store / TestFlight / internal builds use production APNs; development builds the sandbox.
      let result = await apnsSend("api.push.apple.com", config, device.token, payload);
      if (result.status === 400 && result.reason === "BadDeviceToken") {
        result = await apnsSend("api.sandbox.push.apple.com", config, device.token, payload);
      }
      if (result.status === 410 || (result.status === 400 && result.reason === "BadDeviceToken")) gone.push(device.id);
    }),
  );
  await forgetDevices(gone);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Rings every phone of everyone this instant call is still ringing. Does
 * nothing for a scheduled, pending or finished meeting, so it is safe to call
 * after any change to who is invited. `onlyMembers`: ring just these team
 * members (tagged into a call already under way).
 */
export async function ringCallOnPhones(meetingId: string, options: { onlyMembers?: string[] } = {}) {
  try {
    const found = await recipientsFor(meetingId);
    if (!found) return;
    const { meeting, recipient, staffWaiting } = found;
    const only = options.onlyMembers ? new Set(options.onlyMembers.flatMap((id) => [`team:${id}`, `admin:${id}`])) : null;
    const devices = only
      ? await devicesFor(recipient.subjects.filter((subject) => only.has(subject)), false)
      : await devicesFor(recipient.subjects, staffWaiting);
    if (!devices.length) return;
    const shape = (await callShapes([meetingId])).get(meetingId) || { participantCount: 2, group: false };
    const messages = devices.map((device) => {
      const data: IncomingCallPush = {
        kind: "incoming-call",
        id: meeting.id,
        code: meeting.room_code,
        title: meeting.title,
        audioOnly: Boolean(meeting.audio_only),
        callerName: recipient.portalCaller(device.portal),
        callerAvatar: recipient.portalAvatar(device.portal),
        group: shape.group,
        participantCount: shape.participantCount,
        portal: device.portal,
        startedAt: new Date(meeting.started_at).toISOString(),
        ringSeconds: CALL_RING_SECONDS,
        declineUrl: declineUrlFor(meeting.id, device.subject_key),
      };
      return { device, data: data as unknown as Record<string, unknown> };
    });
    await Promise.all([
      sendExpo(messages.filter((m) => m.device.token_kind === "expo")),
      sendVoip(messages.filter((m) => m.device.token_kind === "voip")),
    ]);
  } catch {
    // best effort
  }
}

/**
 * Stops the call ringing on Android phones: everyone's (`subjects` omitted: the
 * call was answered or ended) or only these people's other phones (they
 * declined, or one of them answered elsewhere). `staff`: the admins rung for a
 * client call, once one of them has taken it.
 */
export async function cancelCallOnPhones(meetingId: string, options: { subjects?: string[]; staff?: boolean } = {}) {
  try {
    const everyone = options.subjects ? null : await everyoneRung(meetingId);
    const devices = everyone
      ? await devicesFor(everyone.subjects, everyone.staff)
      : await devicesFor(options.subjects || [], Boolean(options.staff));
    await sendExpo(
      devices
        .filter((device) => device.token_kind === "expo")
        .map((device) => ({ device, data: { kind: "call-cancel", id: meetingId } })),
    );
  } catch {
    // best effort
  }
}
