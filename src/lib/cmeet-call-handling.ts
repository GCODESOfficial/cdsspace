import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { notifyTeamMember } from "@/lib/notify-team";

/**
 * What happens to a client call an admin cannot take.
 *
 * The call used to ring every admin with one option, join, and a client whose
 * call went unanswered simply listened to a ringtone. An admin can now hand it
 * to a colleague or offer another time, and a call nobody answers stops
 * ringing after three minutes and tells the client so.
 */
export const CALL_RING_SECONDS = 180;

export type CallActionKind = "redirected" | "rescheduled" | "unavailable";

export async function recordCallAction(input: {
  meetingId: string;
  actorKey: string;
  actorName?: string | null;
  action: CallActionKind;
  targetMemberId?: string | null;
  targetLabel?: string | null;
  scheduledFor?: string | null;
  note?: string | null;
}) {
  await glashQuery(
    `insert into public.cmeet_call_actions
       (meeting_id, actor_key, actor_name, action, target_member_id, target_label, scheduled_for, note)
     values ($1::uuid,$2,$3,$4,$5::uuid,$6,$7::timestamptz,$8)`,
    [
      input.meetingId,
      input.actorKey,
      input.actorName || null,
      input.action,
      input.targetMemberId || null,
      input.targetLabel || null,
      input.scheduledFor || null,
      input.note || null,
    ],
  );
}

/** Hands the call to a named colleague and tells them it is waiting. */
export async function redirectCall(input: {
  meetingId: string;
  actorKey: string;
  actorName?: string | null;
  targetMemberId: string;
  note?: string | null;
}) {
  const target = await glashMaybeOne<{ id: string; full_name: string }>(
    `select id::text, full_name from public.team_members where id = $1::uuid and is_active = true`,
    [input.targetMemberId],
  );
  if (!target) throw new Error("Choose a colleague who is still active.");

  const meeting = await glashMaybeOne<{ room_code: string; title: string; caller_name: string }>(
    `select m.room_code, m.title,
            coalesce(p.full_name, p.company_name, p.email, 'A client') as caller_name
       from public.team_meetings m
       left join public.profiles p on p.id = m.created_by_client
      where m.id = $1::uuid`,
    [input.meetingId],
  );
  if (!meeting) throw new Error("That call has already ended.");

  await recordCallAction({ ...input, action: "redirected", targetLabel: target.full_name });
  await notifyTeamMember({
    recipient_id: target.id,
    kind: "call_redirected",
    title: `${input.actorName || "An admin"} passed you a call from ${meeting.caller_name}`,
    body: input.note ? input.note : `${meeting.caller_name} is waiting on the line. Join the call to take it.`,
    link: `/meet/${meeting.room_code}?autojoin=1`,
    actor_is_admin: true,
  });
  return { targetName: target.full_name, roomCode: meeting.room_code };
}

/**
 * Offers the client another time and ends the ringing call.
 *
 * The live room is closed rather than left open, because a client sitting in a
 * room nobody will join is worse than a clear message and a time to expect.
 */
export async function rescheduleCall(input: {
  meetingId: string;
  actorKey: string;
  actorName?: string | null;
  scheduledFor: string;
  note?: string | null;
}) {
  const when = new Date(input.scheduledFor);
  if (Number.isNaN(when.getTime())) throw new Error("Choose a valid date and time.");
  if (when.getTime() < Date.now() - 60_000) throw new Error("Choose a time in the future.");

  const meeting = await glashMaybeOne<{ id: string; title: string; created_by_client: string | null; audio_only: boolean }>(
    `select id::text, title, created_by_client::text, audio_only from public.team_meetings where id = $1::uuid`,
    [input.meetingId],
  );
  if (!meeting) throw new Error("That call has already ended.");

  await recordCallAction({ ...input, action: "rescheduled", scheduledFor: when.toISOString() });
  await glashQuery(
    `update public.team_meetings
        set status = 'ended', ended_at = now(), scheduled_for = $2::timestamptz
      where id = $1::uuid`,
    [input.meetingId, when.toISOString()],
  );

  // The client is told in their own dashboard, and the notice carries the time.
  if (meeting.created_by_client) {
    await glashQuery(
      `insert into public.notifications (user_id, type, title, message, link)
       values ($1::uuid, 'cmeet_rescheduled', $2, $3, '/dashboard/cmeet')`,
      [
        meeting.created_by_client,
        "Your call has been rescheduled",
        `${input.actorName || "The CDS Space team"} could not take your call and has proposed ${when.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}.${input.note ? ` ${input.note}` : ""}`,
      ],
    ).catch((error) => console.error("[cmeet-call] could not tell the client", error));
  }
  return { scheduledFor: when.toISOString() };
}

/** Colleagues an admin can hand a call to. */
export async function callTransferTargets() {
  return glashQuery<{ id: string; full_name: string; role_title: string | null; department: string | null }>(
    `select id::text, full_name, role_title, department
       from public.team_members
      where is_active = true
      order by full_name
      limit 200`,
  );
}
