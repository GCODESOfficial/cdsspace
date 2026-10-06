import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { CALL_RING_SECONDS, recordCallAction } from "@/lib/cmeet-call-handling";

/**
 * Who an instant call rings, so both ends can behave like a phone call.
 *
 * The person being called sees whether it is a one-to-one or a group call; the
 * caller sees who is being rung and learns at once when the call is declined,
 * instead of listening to a ringback tone for three minutes.
 *
 * A call rings everyone invited except its creator: team members
 * (team_meeting_participants), clients (cmeet_client_invitations) and, for a
 * call from a client, CDS Space itself (one shared cmeet_staff_invitations
 * row, answered by whichever admin joins first).
 */

export type CallShape = { participantCount: number; group: boolean };

/** One-to-one or group, for each ringing call. Missing ids count as one-to-one. */
export async function callShapes(meetingIds: string[]): Promise<Map<string, CallShape>> {
  const shapes = new Map<string, CallShape>();
  if (!meetingIds.length) return shapes;
  const rows = await glashQuery<{ id: string; invitees: number }>(
    `select meeting.id::text as id,
            (select count(*) from public.team_meeting_participants participant
              where participant.meeting_id = meeting.id
                and participant.team_member_id is distinct from meeting.created_by)
          + (select count(*) from public.cmeet_client_invitations invitation
              where invitation.meeting_id = meeting.id)
          + (select count(*) from public.cmeet_staff_invitations staff
              where staff.meeting_id = meeting.id) as invitees
       from public.team_meetings meeting
      where meeting.id = any($1::uuid[])`,
    [meetingIds],
  ).catch(() => []);
  for (const row of rows) {
    const invitees = Math.max(1, Number(row.invitees) || 0);
    shapes.set(row.id, { participantCount: invitees + 1, group: invitees > 1 });
  }
  return shapes;
}

export type CallingStatus = {
  /** Up to three of the people being rung, for "Calling Ada" / "Calling Ada, Tom and 2 others". */
  names: string[];
  /** Their profile photos, in the same order as `names` (null without one). */
  avatars: (string | null)[];
  invited: number;
  joined: number;
  declined: number;
  group: boolean;
  ringingSeconds: number;
  ringSeconds: number;
};

/**
 * What the caller's screen shows while an instant call rings. Null when the
 * meeting rings nobody (a plain room), was scheduled, or is over.
 */
export async function callingStatus(meetingId: string): Promise<CallingStatus | null> {
  const meeting = await glashMaybeOne<{ ringing_seconds: number; live: boolean }>(
    `select extract(epoch from (now() - coalesce(started_at, created_at)))::int as ringing_seconds,
            (status = 'live' and scheduled_for is null and ended_at is null) as live
       from public.team_meetings where id = $1::uuid`,
    [meetingId],
  ).catch(() => null);
  if (!meeting?.live) return null;

  const people = await glashQuery<{ name: string; avatar: string | null; joined: boolean; declined: boolean }>(
    `select coalesce(member.full_name, 'A teammate') as name,
            member.avatar_url as avatar,
            (participant.joined_at is not null) as joined,
            exists (select 1 from public.cmeet_call_actions action
                     where action.meeting_id = participant.meeting_id
                       and action.actor_key = participant.team_member_id::text
                       and action.action = 'declined') as declined
       from public.team_meeting_participants participant
       join public.team_meetings meeting on meeting.id = participant.meeting_id
       left join public.team_members member on member.id = participant.team_member_id
      where participant.meeting_id = $1::uuid
        and participant.team_member_id is distinct from meeting.created_by
     union all
     select coalesce(profile.full_name, profile.company_name, profile.email, 'Client'),
            profile.avatar_url,
            (invitation.joined_at is not null),
            (invitation.dismissed_at is not null)
       from public.cmeet_client_invitations invitation
       left join public.profiles profile on profile.id = invitation.client_user_id
      where invitation.meeting_id = $1::uuid
     union all
     -- Several admins may be rung for one client call; one of them saying no
     -- is not the call being declined (another may answer). A teammate's call
     -- to the admin is declined when an admin (not a participant) says no.
     select 'CDS Space', '/favicon.png', (staff.joined_at is not null),
            (meeting.created_by_client is null and exists (
              select 1 from public.cmeet_call_actions action
               where action.meeting_id = staff.meeting_id and action.action = 'declined'
                 and not exists (select 1 from public.team_meeting_participants participant
                                  where participant.meeting_id = staff.meeting_id
                                    and participant.team_member_id::text = action.actor_key)))
       from public.cmeet_staff_invitations staff
       join public.team_meetings meeting on meeting.id = staff.meeting_id
      where staff.meeting_id = $1::uuid`,
    [meetingId],
  ).catch(() => []);
  if (!people.length) return null;

  return {
    names: people.slice(0, 3).map((person) => person.name),
    avatars: people.slice(0, 3).map((person) => person.avatar || null),
    invited: people.length,
    joined: people.filter((person) => person.joined).length,
    declined: people.filter((person) => person.declined).length,
    group: people.length > 1,
    ringingSeconds: Number(meeting.ringing_seconds) || 0,
    ringSeconds: CALL_RING_SECONDS,
  };
}

/** Meetings this team member has declined, so they stop ringing on all their devices. */
export async function declinedMeetingIds(actorKey: string, meetingIds: string[]): Promise<Set<string>> {
  if (!meetingIds.length) return new Set();
  const rows = await glashQuery<{ meeting_id: string }>(
    `select meeting_id::text from public.cmeet_call_actions
      where actor_key = $1 and action = 'declined' and meeting_id = any($2::uuid[])`,
    [actorKey, meetingIds],
  ).catch(() => []);
  return new Set(rows.map((row) => row.meeting_id));
}

/**
 * Records that someone declined a ringing call. Clients also dismiss their
 * invitation, which is what their incoming-call list already filters on.
 */
export async function declineCall(input: {
  meetingId: string;
  actorKey: string;
  actorName?: string | null;
  clientUserId?: string | null;
}) {
  const already = await glashMaybeOne<{ id: string }>(
    `select id::text from public.cmeet_call_actions
      where meeting_id = $1::uuid and actor_key = $2 and action = 'declined' limit 1`,
    [input.meetingId, input.actorKey],
  );
  if (!already) {
    await recordCallAction({ meetingId: input.meetingId, actorKey: input.actorKey, actorName: input.actorName, action: "declined" });
  }
  if (input.clientUserId) {
    await glashQuery(
      `update public.cmeet_client_invitations
          set dismissed_at = coalesce(dismissed_at, now())
        where meeting_id = $1::uuid and client_user_id = $2::uuid`,
      [input.meetingId, input.clientUserId],
    );
  }
}
