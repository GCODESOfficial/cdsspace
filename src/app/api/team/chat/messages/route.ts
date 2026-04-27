/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getChatViewer } from "@/lib/team-chat-auth";
import {
  canViewTeamThread,
  getTeamChatDb,
  getViewerPayload,
  hydrateTeamMessages,
} from "@/lib/team-chat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });

  if (!(await canViewTeamThread(viewer, threadId))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await db
    .from("team_chat_messages")
    .select(
      "id, thread_id, sender_id, sender_is_admin, body, attachment_url, forwarded, reply_to_message_id, sticker_key, reactions, edited_at, deleted_at, created_at",
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const enriched = await hydrateTeamMessages((data || []) as any[]);

  return NextResponse.json({
    ok: true,
    messages: enriched,
    viewer: getViewerPayload(viewer),
  });
}

export async function POST(req: Request) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { threadId, body, attachmentUrl, replyToMessageId, stickerKey } = await req.json().catch(() => ({}));
  if (!threadId || !(body?.trim() || attachmentUrl || stickerKey)) {
    return NextResponse.json(
      { ok: false, error: "threadId and a message body, sticker, or attachment are required" },
      { status: 400 },
    );
  }
  if (!(await canViewTeamThread(viewer, threadId))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (replyToMessageId) {
    const { data: replyMessage } = await db
      .from("team_chat_messages")
      .select("id, thread_id")
      .eq("id", replyToMessageId)
      .maybeSingle();
    if (!replyMessage || replyMessage.thread_id !== threadId) {
      return NextResponse.json({ ok: false, error: "Reply target not found" }, { status: 404 });
    }
  }

  const { data: msg, error } = await db
    .from("team_chat_messages")
    .insert({
      thread_id: threadId,
      sender_id: viewer.kind === "team" ? viewer.session.id : null,
      sender_is_admin: viewer.kind === "admin",
      body: body?.trim() || null,
      attachment_url: attachmentUrl || null,
      reply_to_message_id: replyToMessageId || null,
      sticker_key: stickerKey || null,
    })
    .select(
      "id, thread_id, sender_id, sender_is_admin, body, attachment_url, forwarded, reply_to_message_id, sticker_key, reactions, edited_at, deleted_at, created_at",
    )
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Notify other participants. Title now leads with the sender's name so
  // the bell groups visually by who-said-what-where, e.g.:
  //   "Emediong · #Family House"
  //   body: "hey I was thinking we should..."
  const { data: parts } = await db
    .from("team_chat_participants")
    .select("team_member_id")
    .eq("thread_id", threadId);
  const { data: thread } = await db
    .from("team_chat_threads")
    .select("name, kind")
    .eq("id", threadId)
    .maybeSingle();
  const threadLabel = thread?.name || (thread?.kind === "direct" ? "Direct message" : "Team chat");

  const senderName =
    viewer.kind === "admin"
      ? (viewer.name || "Admin")
      : (viewer.session.full_name || "A teammate");
  const senderId = viewer.kind === "team" ? viewer.session.id : null;

  const notifRows = (parts || [])
    .filter((p: any) => p.team_member_id !== senderId)
    .map((p: any) => ({
      recipient_id: p.team_member_id,
      kind: "chat_message",
      title: `${senderName} · ${threadLabel}`,
      body: stickerKey ? "Sticker" : body?.slice(0, 120) || "Attachment",
      link: `/team/chat?thread=${threadId}`,
      thread_id: threadId,
      actor_member_id: senderId,
      actor_is_admin: viewer.kind === "admin",
    }));
  if (notifRows.length) await db.from("team_notifications").insert(notifRows);

  const [message] = await hydrateTeamMessages([msg]);

  return NextResponse.json({
    ok: true,
    message,
  });
}
