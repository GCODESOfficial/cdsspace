/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getChatViewer } from "@/lib/team-chat-auth";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";

// POST { threadId } — upsert the viewer's last_read_at for this thread.
export async function POST(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (viewer.kind !== "team") return NextResponse.json({ ok: true }); // admin has no per-thread read state

  const { threadId } = await req.json().catch(() => ({}));
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });

  const db = supabaseAdmin as any;
  const now = new Date().toISOString();
  const { error } = await db
    .from("team_chat_participants")
    .upsert(
      { thread_id: threadId, team_member_id: viewer.session.id, last_read_at: now },
      { onConflict: "thread_id,team_member_id" }
    );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Opening a thread is a strong signal the user saw every unread
  // chat_message notification for it — clear them so the bell badge drops
  // without waiting for an extra click in the bell itself.
  await db
    .from("team_notifications")
    .update({ read_at: now })
    .eq("recipient_id", viewer.session.id)
    .eq("thread_id", threadId)
    .is("read_at", null);

  try {
    await glashQuery(
      `insert into public.team_chat_message_receipts (message_id, thread_id, viewer_key, viewer_kind, team_member_id, delivered_at, read_at, last_seen_at)
       select m.id, m.thread_id, $2, 'team', $3::uuid, coalesce(m.sent_at, m.created_at), $4::timestamptz, $4::timestamptz
       from public.team_chat_messages m
       where m.thread_id = $1
         and m.sender_id is distinct from $3::uuid
         and m.deleted_at is null
       on conflict (message_id, viewer_key)
       do update set read_at = excluded.read_at, last_seen_at = excluded.last_seen_at`,
      [threadId, viewer.session.id, viewer.session.id, now],
    );

    await glashQuery(
      `update public.team_chat_participants
       set last_seen_at = $3::timestamptz
       where thread_id = $1 and team_member_id = $2::uuid`,
      [threadId, viewer.session.id, now],
    );
  } catch {
    /* receipt/presence writes are best-effort */
  }

  return NextResponse.json({ ok: true });
}
