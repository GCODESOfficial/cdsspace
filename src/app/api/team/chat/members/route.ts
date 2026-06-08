/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getChatViewer } from "@/lib/team-chat-auth";
import { glashQuery } from "@/lib/glashdb/postgres";
import { lagosDate } from "@/lib/timebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getChatViewer();
  if (!viewer) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
         when e.current_status = 'on_break' then 'break'
         when exists (
           select 1
           from public.team_device_sessions s
           where s.team_member_id = m.id
             and s.revoked_at is null
             and s.expires_at > now()
         ) then 'online'
         else 'offline'
       end as status
     from public.team_members m
     left join public.team_time_entries e
       on e.team_member_id = m.id
      and e.work_date = $1
     where m.is_active = true
     order by
       case
         when e.current_status = 'on_break' then 1
         when exists (
           select 1
           from public.team_device_sessions s
           where s.team_member_id = m.id
             and s.revoked_at is null
             and s.expires_at > now()
         ) then 0
         else 2
       end,
       m.full_name asc`,
    [lagosDate()],
  );

  const list = data || [];
  
  // Prepend a virtual "Admin" account at the top
  const adminAccount = {
    id: "admin",
    full_name: "Admin",
    avatar_url: null,
    username: "admin",
    role_title: "System Administrator",
    department: "Support",
    status: "online",
  };

  const withAdmin = [adminAccount, ...list];

  // Filter out the current user if they are a team member
  const filtered = viewer.kind === "team"
    ? withAdmin.filter((m: any) => m.id !== viewer.session.id)
    : withAdmin;

  return NextResponse.json({ ok: true, members: filtered });
}
