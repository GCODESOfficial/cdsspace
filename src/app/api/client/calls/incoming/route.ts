import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { closeStaleCmeets } from "@/lib/cmeet-autoclose";
import { buildCMeetPath } from "@/lib/cmeet-links";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  await closeStaleCmeets();
  const path = new URL(req.url).searchParams.get("path")?.slice(0, 300) || null;
  await glashQuery(
    `insert into public.client_presence (client_user_id, last_seen_at, last_path, updated_at)
     values ($1::uuid, now(), $2, now())
     on conflict (client_user_id) do update set last_seen_at = now(), last_path = excluded.last_path, updated_at = now()`,
    [account.user.id, path],
  );
  const calls = await glashQuery<{
    id:string; room_code:string; title:string; audio_only:boolean; started_at:string; created_by_admin:boolean;
  }>(
    `select meeting.id, meeting.room_code, meeting.title, meeting.audio_only,
            coalesce(meeting.started_at, meeting.created_at)::text as started_at,
            meeting.created_by_admin
       from public.cmeet_client_invitations invitation
       join public.team_meetings meeting on meeting.id = invitation.meeting_id
      where invitation.client_user_id = $1::uuid
        and invitation.joined_at is null and invitation.dismissed_at is null
        and meeting.status = 'live' and meeting.scheduled_for is null and meeting.ended_at is null
      order by invitation.invited_at desc limit 5`,
    [account.user.id],
  );
  return NextResponse.json({ ok:true, calls:calls.map(call=>({ id:call.id, roomCode:call.room_code, title:call.title, audioOnly:call.audio_only, callerName:call.created_by_admin?"CDS Space":"CDS Space team", startedAt:call.started_at, link:buildCMeetPath(call.room_code,call.title) })) });
}
