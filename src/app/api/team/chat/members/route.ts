/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getChatViewer, viewerMemberId } from "@/lib/team-chat-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { lagosDate } from "@/lib/timebook";
import { enforceDailyTeamSessionCutoff } from "@/lib/team-session-cutoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const viewer = await getChatViewer();
  if (!viewer) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  await enforceDailyTeamSessionCutoff().catch(() => undefined);

  // When a threadId is supplied (used by the @-mention picker), scope the list
  // to the members of that specific chat group. Groups, direct chats and
  // department channels all have explicit participant rows.
  const threadId = req.nextUrl.searchParams.get("threadId");
  let scopeParticipants = false;
  let includeAdmin = true;
  if (threadId) {
    const count = await glashMaybeOne<{ n: number }>(
      "select count(*)::int as n from public.team_chat_participants where thread_id = $1",
      [threadId],
    ).catch(() => null);
    // Only scope when the thread actually has participant rows; otherwise fall
    // back to the full roster so mentions still work everywhere.
    scopeParticipants = !!count && Number(count.n) > 0;
    const thread = await glashMaybeOne<{ includes_admin: boolean }>(
      "select includes_admin from public.team_chat_threads where id = $1",
      [threadId],
    ).catch(() => null);
    includeAdmin = !!thread?.includes_admin;
  }

  const data = await glashQuery(
    `select
       m.id,
       m.full_name,
       m.username,
       m.avatar_url,
       m.role_title,
       m.department,
       case
         when exists (
           select 1
           from public.team_device_sessions s
           where s.team_member_id = m.id
             and s.revoked_at is null
             and s.expires_at > now()
             and s.last_seen_at >= now() - interval '5 minutes'
         ) then case when e.current_status = 'on_break' then 'break' else 'online' end
         else 'offline'
       end as status
     from public.team_members m
     left join public.team_time_entries e
       on e.team_member_id = m.id
      and e.work_date = $1
     where m.is_active = true
       and ($2::uuid is null or m.id in (
         select team_member_id from public.team_chat_participants where thread_id = $2
       ))
     order by
       case
         when exists (
           select 1
           from public.team_device_sessions s
           where s.team_member_id = m.id
             and s.revoked_at is null
             and s.expires_at > now()
             and s.last_seen_at >= now() - interval '5 minutes'
         ) then case when e.current_status = 'on_break' then 1 else 0 end
         else 2
       end,
       m.full_name asc`,
    [lagosDate(), scopeParticipants ? threadId : null],
  );

  const list = data || [];
  
  // The virtual account represents only the true super admin. Delegated
  // admins remain ordinary named team-member identities in chat.
  const adminAccount = {
    id: "admin",
    full_name: "Super admin",
    avatar_url: null,
    username: "admin",
    role_title: "Super admin",
    department: "Support",
    status: "online",
  };

  const withAdmin = includeAdmin ? [adminAccount, ...list] : list;

  // Filter out the current user if they are a team member
  const memberId = viewerMemberId(viewer);
  const filtered = memberId
    ? withAdmin.filter((m: any) => m.id !== memberId)
    : withAdmin;

  return NextResponse.json({ ok: true, members: filtered });
}
