import { NextResponse } from "next/server";
import { getToolActor } from "@/lib/team-tools-auth";
import { getClientAccountState } from "@/lib/client-account";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/calls/status?codes=a,b,c - what became of instant calls posted in a
 * chat, so the chat shows them like WhatsApp (ongoing with Join, ended with
 * its length, missed, declined, cancelled) instead of a join link forever.
 *
 * Per room code: { kind, audioOnly, durationSeconds, endedAt }
 *   kind: 'live' (ringing or under way; `answered` says which) | 'ended'
 *         (someone answered) | 'missed' (rang out, nobody answered) |
 *         'declined' | 'cancelled' (the caller hung up before anyone answered)
 *         | 'scheduled' (a booked meeting, not a call) | 'pending'.
 * Any signed-in portal may ask; it only reveals what the chat already shows.
 */
const CODE = /^[a-z0-9-]{3,64}$/i;
// A call the caller gave up on this quickly was cancelled, not left to ring out.
const CANCELLED_WITHIN_SECONDS = 55;

export async function GET(request: Request) {
  const actor = await getToolActor().catch(() => null);
  const account = actor ? null : await getClientAccountState().catch(() => null);
  if (!actor && !account?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const codes = Array.from(new Set(
    (new URL(request.url).searchParams.get("codes") || "").split(",").map((code) => code.trim()).filter((code) => CODE.test(code)),
  )).slice(0, 60);
  if (!codes.length) return NextResponse.json({ calls: {} });

  const rows = await glashQuery<{
    room_code: string;
    status: string;
    audio_only: boolean;
    scheduled: boolean;
    ended_at: string | null;
    rang_seconds: number | null;
    answered_at: string | null;
    talk_seconds: number | null;
    declined: boolean;
  }>(
    `with calls as (
       select m.id, m.room_code, m.status, m.audio_only, m.scheduled_for is not null as scheduled,
              coalesce(m.started_at, m.created_at) as started, m.ended_at,
              (select min(j.at) from (
                 select p.joined_at as at from public.team_meeting_participants p
                  where p.meeting_id = m.id and p.joined_at is not null and p.team_member_id is distinct from m.created_by
                 union all
                 select c.joined_at from public.cmeet_client_invitations c
                  where c.meeting_id = m.id and c.joined_at is not null
                    and c.client_user_id is distinct from m.created_by_client
                 union all
                 select s.joined_at from public.cmeet_staff_invitations s
                  where s.meeting_id = m.id and s.joined_at is not null
               ) j) as answered_at,
              exists (select 1 from public.cmeet_call_actions a where a.meeting_id = m.id and a.action = 'declined') as declined
         from public.team_meetings m
        where m.room_code = any($1::text[]))
     select room_code, status, audio_only, scheduled, ended_at::text,
            extract(epoch from (ended_at - started))::int as rang_seconds,
            answered_at::text,
            extract(epoch from (coalesce(ended_at, now()) - answered_at))::int as talk_seconds,
            declined
       from calls`,
    [codes],
  ).catch(() => []);

  const calls: Record<string, unknown> = {};
  for (const row of rows) {
    const over = row.status === "ended" || row.status === "cancelled" || Boolean(row.ended_at);
    let kind: string;
    if (row.scheduled && !row.answered_at && !over) kind = "scheduled";
    else if (row.status === "pending_approval") kind = "pending";
    else if (!over) kind = "live";
    else if (row.answered_at) kind = "ended";
    else if (row.declined) kind = "declined";
    else if (row.status === "cancelled" || (row.rang_seconds ?? 0) < CANCELLED_WITHIN_SECONDS) kind = "cancelled";
    else kind = "missed";
    calls[row.room_code] = {
      kind,
      audioOnly: Boolean(row.audio_only),
      answered: Boolean(row.answered_at),
      durationSeconds: row.answered_at ? Math.max(0, row.talk_seconds ?? 0) : 0,
      endedAt: row.ended_at,
    };
  }
  return NextResponse.json({ calls }, { headers: { "Cache-Control": "no-store" } });
}
