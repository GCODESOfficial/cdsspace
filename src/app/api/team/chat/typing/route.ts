import { NextResponse } from "next/server";
import { getChatViewer } from "@/lib/team-chat-auth";
import { canViewTeamThread, getViewerReactionKey } from "@/lib/team-chat-server";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { threadId, typing } = await req.json().catch(() => ({}));
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
  if (!(await canViewTeamThread(viewer, threadId))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const timestamp = typing === false ? null : new Date().toISOString();
  try {
    if (viewer.kind === "team") {
      await glashQuery(
        `update public.team_chat_participants
         set last_typing_at = $3::timestamptz, last_seen_at = coalesce(last_seen_at, now())
         where thread_id = $1 and team_member_id = $2::uuid`,
        [threadId, viewer.session.id, timestamp],
      );
    } else {
      await glashQuery(
        `insert into public.team_chat_audit_logs
          (actor_key, actor_kind, action, resource_type, resource_id, thread_id, metadata)
         values ($1, 'admin', 'chat.typing', 'team_chat_thread', $2, $2::uuid, $3::jsonb)`,
        [getViewerReactionKey(viewer), threadId, JSON.stringify({ typing: typing !== false, at: timestamp })],
      );
    }
  } catch {
    /* best-effort presence */
  }

  return NextResponse.json({ ok: true });
}
