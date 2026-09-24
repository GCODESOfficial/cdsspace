import { NextResponse } from "next/server";
import { getChatViewer, viewerIsSuperAdmin, viewerMemberId } from "@/lib/team-chat-auth";
import { canViewTeamThread } from "@/lib/team-chat-server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MessageRow = {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_is_admin: boolean;
  reactions: Record<string, string[]> | null;
  metadata: Record<string, unknown> | null;
};

type StatusRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  delivered_at: string | null;
  read_at: string | null;
  online: boolean;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getChatViewer();
  if (!viewer) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const message = await glashMaybeOne<MessageRow>(
    `select id, thread_id, sender_id, sender_is_admin, reactions, metadata
       from public.team_chat_messages
      where id = $1::uuid`,
    [id],
  ).catch(() => null);
  if (!message) {
    return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
  }
  if (!(await canViewTeamThread(viewer, message.thread_id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // The breakdown of who has and has not completed a task post belongs to the
  // person who posted it and to the super admin. A sub-admin who simply sits
  // in the thread is one of the people being tracked, not a supervisor of it.
  const memberId = viewerMemberId(viewer);
  const isSuperAdmin = viewerIsSuperAdmin(viewer);
  const ownsMessage = message.sender_is_admin
    ? viewer.kind === "admin"
    : Boolean(memberId && message.sender_id === memberId);
  if (!isSuperAdmin && !ownsMessage) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const rows = await glashQuery<StatusRow>(
    `select
       m.id,
       coalesce(nullif(m.full_name, ''), nullif(m.username, ''), 'Team member') as name,
       m.avatar_url,
       r.delivered_at,
       r.read_at,
       exists (
         select 1
           from public.team_device_sessions s
          where s.team_member_id = m.id
            and s.revoked_at is null
            and s.expires_at > now()
            and s.last_seen_at >= now() - interval '5 minutes'
       ) as online
     from public.team_chat_participants p
     join public.team_members m on m.id = p.team_member_id
     left join public.team_chat_message_receipts r
       on r.message_id = $1::uuid
      and r.team_member_id = m.id
     where p.thread_id = $2::uuid
       and m.is_active = true
       and m.id is distinct from $3::uuid
     order by
       case when r.read_at is not null then 0 when r.delivered_at is not null then 1 when exists (
         select 1 from public.team_device_sessions s
          where s.team_member_id = m.id and s.revoked_at is null
            and s.expires_at > now() and s.last_seen_at >= now() - interval '5 minutes'
       ) then 2 else 3 end,
       m.full_name asc`,
    [id, message.thread_id, message.sender_id],
  );

  const completionIds = new Set(message.reactions?.__task_compliant__ || []);
  const taskPost = Boolean(message.metadata?.task_post);
  const members = rows.map((row) => ({
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url,
    online: row.online,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    compliant: completionIds.has(row.id),
    state: row.read_at
      ? "seen"
      : row.delivered_at
        ? "delivered"
        : row.online
          ? "not_seen"
          : "offline",
  }));

  return NextResponse.json({
    ok: true,
    status: {
      total: members.length,
      seen: members.filter((member) => member.state === "seen").length,
      delivered: members.filter((member) => member.state === "delivered").length,
      notSeen: members.filter((member) => member.state === "not_seen").length,
      offline: members.filter((member) => member.state === "offline").length,
      taskPost,
      compliant: members.filter((member) => member.compliant).length,
      members,
    },
  });
}
