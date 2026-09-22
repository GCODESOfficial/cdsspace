/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getChatViewer, viewerIsSuperAdmin, viewerMemberId } from "@/lib/team-chat-auth";
import { canViewTeamThread, getViewerReactionKey } from "@/lib/team-chat-server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { verifyAdmin, verifyUser } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function likeTerm(query: string) {
  return `%${query.replace(/[%_]/g, "\\$&")}%`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const scope = url.searchParams.get("scope") || "team";
  const threadId = url.searchParams.get("threadId");
  const limit = Math.min(80, Math.max(10, Number(url.searchParams.get("limit") || 40)));
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

  if (scope === "client") {
    const admin = await verifyAdmin();
    const user = await verifyUser();
    if (!admin && !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const roomFilter = user && !admin ? `client_${user.user.id}` : url.searchParams.get("roomId");
    const params: any[] = [likeTerm(q), limit];
    let roomClause = "";
    if (roomFilter) {
      params.push(roomFilter);
      roomClause = `and room_id = $3`;
    }
    const rows = await glashQuery(
      `select id, room_id, message, file_url, sender_role, source, created_at, pinned_at, starred_by, bookmarked_by
       from public.chat_messages
       where deleted_at is null
         and (message ilike $1 or coalesce(file_name, '') ilike $1 or coalesce(voice_transcript, '') ilike $1)
         ${roomClause}
       order by created_at desc
       limit $2`,
      params,
    );
    return NextResponse.json({ ok: true, scope: "client", results: rows });
  }

  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const viewerKey = getViewerReactionKey(viewer);
  let threadIds: string[] = [];
  if (threadId) {
    if (!(await canViewTeamThread(viewer, threadId))) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    threadIds = [threadId];
  } else if (viewerIsSuperAdmin(viewer)) {
    const rows = await glashQuery<{ id: string }>(
      `select id
       from public.team_chat_threads
       where kind in ('group','department','admin_broadcast')
          or visibility = 'public'
          or (kind = 'direct' and includes_admin = true)`,
    );
    threadIds = rows.map((row) => row.id);
  } else {
    const rows = await glashQuery<{ id: string }>(
      `select distinct t.id
       from public.team_chat_threads t
       left join public.team_chat_participants p
         on p.thread_id = t.id and p.team_member_id = $1::uuid
       where p.team_member_id is not null
          or t.kind = 'admin_broadcast'
          or t.kind = 'department'
          or t.visibility = 'public'`,
      [viewerMemberId(viewer)],
    );
    threadIds = rows.map((row) => row.id);
  }

  if (!threadIds.length) return NextResponse.json({ ok: true, scope: "team", results: [] });

  const rows = await glashQuery(
    `select
       m.id,
       m.thread_id,
       t.name as thread_name,
       t.kind as thread_kind,
       m.body,
       m.attachment_url,
       m.sender_id,
       m.sender_is_admin,
       m.created_at,
       m.pinned_at,
       m.starred_by,
       m.bookmarked_by,
       coalesce(m.starred_by ? $3, false) as starred_by_viewer,
       coalesce(m.bookmarked_by ? $3, false) as bookmarked_by_viewer
     from public.team_chat_messages m
     join public.team_chat_threads t on t.id = m.thread_id
     where m.thread_id = any($1::uuid[])
       and m.deleted_at is null
       and (
         coalesce(m.body, '') ilike $2
         or coalesce(m.file_name, '') ilike $2
         or coalesce(m.voice_transcript, '') ilike $2
       )
     order by m.created_at desc
     limit $4`,
    [threadIds, likeTerm(q), viewerKey, limit],
  );

  return NextResponse.json({ ok: true, scope: "team", results: rows });
}
