/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getChatViewer } from "@/lib/team-chat-auth";
import { canViewTeamThread } from "@/lib/team-chat-server";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What a message counts as, for the chat info tabs (as WhatsApp's Media, Docs and Links).
const MEDIA = `(m.attachment_url is not null and (
  m.message_type in ('image', 'video')
  or coalesce(m.mime_type, '') like 'image/%'
  or coalesce(m.mime_type, '') like 'video/%'))`;
const FILES = `(m.attachment_url is not null
  and coalesce(m.message_type, '') not in ('image', 'video', 'audio', 'sticker')
  and coalesce(m.mime_type, '') not like 'image/%'
  and coalesce(m.mime_type, '') not like 'video/%'
  and coalesce(m.mime_type, '') not like 'audio/%')`;
const LINKS = `(m.body ~* 'https?://[^[:space:]]+')`;
const TYPES: Record<string, string> = { media: MEDIA, files: FILES, links: LINKS };

// GET ?threadId=&type=media|files|links&before=<iso>&limit=
// The photos and videos, files, or links shared in a conversation, newest first.
export async function GET(req: NextRequest) {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const threadId = params.get("threadId") || "";
  const type = params.get("type") || "media";
  const before = params.get("before");
  const limit = Math.min(Math.max(Number(params.get("limit")) || 60, 1), 200);
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
  if (!TYPES[type]) return NextResponse.json({ ok: false, error: "type must be media, files or links" }, { status: 400 });
  if (!(await canViewTeamThread(viewer, threadId))) {
    return NextResponse.json({ ok: false, error: "You can't view this conversation." }, { status: 403 });
  }

  const rows = await glashQuery<any>(
    `select m.id, m.thread_id, m.sender_id, m.sender_is_admin, m.body, m.attachment_url, m.file_name,
            m.file_size_bytes, m.mime_type, m.message_type, m.created_at
       from public.team_chat_messages m
      where m.thread_id = $1
        and m.deleted_at is null
        and ($2::timestamptz is null or m.created_at < $2::timestamptz)
        and ${TYPES[type]}
      order by m.created_at desc
      limit $3`,
    [threadId, before || null, limit + 1],
  );
  const list = rows || [];
  return NextResponse.json({ ok: true, items: list.slice(0, limit), hasMore: list.length > limit });
}
