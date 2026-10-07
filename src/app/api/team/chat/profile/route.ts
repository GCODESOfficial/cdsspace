/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getChatViewer, viewerMemberId } from "@/lib/team-chat-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?memberId= - a colleague's chat profile, as WhatsApp's contact info: name, photo,
// job role and department, and the groups the viewer and they are both in. Nothing
// about who is an admin or what they may do (is_sub_admin, permissions) is returned.
export async function GET(req: NextRequest) {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const memberId = req.nextUrl.searchParams.get("memberId") || "";
  if (!memberId) return NextResponse.json({ ok: false, error: "memberId required" }, { status: 400 });
  if (memberId === "admin") {
    // The virtual super admin account (members route) has no profile row or groups.
    return NextResponse.json({
      ok: true,
      member: { id: "admin", full_name: "CDS Space", username: null, avatar_url: null, role_title: null, department: null, bio: null },
      common_groups: [],
    });
  }

  const member = await glashMaybeOne<any>(
    `select id, full_name, username, avatar_url, role_title, department, bio
       from public.team_members
      where id = $1 and is_active = true`,
    [memberId],
  ).catch(() => null);
  if (!member) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Shared groups: both are participants. An admin without a member identity shares the
  // groups that include the admin.
  const me = viewerMemberId(viewer);
  const groups = await glashQuery<any>(
    `select t.id, t.kind, t.name, t.department, t.settings->>'avatar_url' as avatar_url,
            (select count(*)::int from public.team_chat_participants c where c.thread_id = t.id) as member_count
       from public.team_chat_threads t
       join public.team_chat_participants them on them.thread_id = t.id and them.team_member_id = $1
      where t.kind <> 'direct'
        and t.archived_at is null
        and (
          ($2::uuid is not null and exists (
            select 1 from public.team_chat_participants mine where mine.thread_id = t.id and mine.team_member_id = $2))
          or ($2::uuid is null and t.includes_admin = true)
        )
      order by coalesce(t.last_message_at, t.created_at) desc
      limit 50`,
    [memberId, me],
  ).catch(() => []);

  return NextResponse.json({ ok: true, member, common_groups: groups || [] });
}
