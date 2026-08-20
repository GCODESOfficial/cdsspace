/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getClientChatContext, getClientProjectThread } from "@/lib/client-project-chat";
import {
  hydrateTeamMessages,
  TEAM_CHAT_MESSAGE_COLUMNS,
} from "@/lib/team-chat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const context = await getClientChatContext();
  if (!context) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId") || "";
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });

  const { account, db } = context;
  const access = await getClientProjectThread(db, account.user.id, threadId);
  if (!access) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { data, error } = await db
    .from("team_chat_messages")
    .select(TEAM_CHAT_MESSAGE_COLUMNS)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await db
    .from("team_chat_client_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("client_user_id", account.user.id);

  const messages = await hydrateTeamMessages((data || []) as any[]);
  return NextResponse.json({ ok: true, messages });
}

export async function POST(req: Request) {
  const context = await getClientChatContext();
  if (!context) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { account, db } = context;
  const payload = await req.json().catch(() => ({}));
  const threadId = String(payload.threadId || "");
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const attachmentUrl = typeof payload.attachmentUrl === "string" ? payload.attachmentUrl : null;
  const replyToMessageId = typeof payload.replyToMessageId === "string" && payload.replyToMessageId
    ? payload.replyToMessageId
    : null;
  if (!threadId || (!body && !attachmentUrl)) {
    return NextResponse.json({ ok: false, error: "A thread and message are required" }, { status: 400 });
  }

  const access = await getClientProjectThread(db, account.user.id, threadId);
  if (!access) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  if (access.thread.is_announcement_only) {
    return NextResponse.json({ ok: false, error: "This project channel is read-only." }, { status: 403 });
  }

  if (replyToMessageId) {
    const { data: replyTarget } = await db
      .from("team_chat_messages")
      .select("id, thread_id")
      .eq("id", replyToMessageId)
      .maybeSingle();
    if (!replyTarget || replyTarget.thread_id !== threadId) {
      return NextResponse.json({ ok: false, error: "The message being replied to is not in this project chat." }, { status: 400 });
    }
  }

  const { data: message, error } = await db
    .from("team_chat_messages")
    .insert({
      thread_id: threadId,
      sender_id: null,
      client_user_id: account.user.id,
      sender_is_admin: false,
      body: body || null,
      attachment_url: attachmentUrl,
      message_type: attachmentUrl ? "file" : "text",
      delivery_status: "sent",
      sent_at: new Date().toISOString(),
      file_name: typeof payload.fileName === "string" ? payload.fileName : null,
      file_size_bytes: Number.isFinite(Number(payload.fileSizeBytes)) ? Number(payload.fileSizeBytes) : null,
      mime_type: typeof payload.mimeType === "string" ? payload.mimeType : null,
      reply_to_message_id: replyToMessageId,
    })
    .select(TEAM_CHAT_MESSAGE_COLUMNS)
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const senderName = account.profile.full_name || account.profile.company_name || account.profile.email || "Client";
  const { data: participants } = await db
    .from("team_chat_participants")
    .select("team_member_id")
    .eq("thread_id", threadId);
  const notificationRows = (participants || []).map((participant: any) => ({
    recipient_id: participant.team_member_id,
    kind: "chat_message",
    title: `${senderName} · ${access.thread.name || "Project chat"}`,
    body: body.slice(0, 120) || "Attachment",
    link: `/team/chat?thread=${threadId}`,
    thread_id: threadId,
    actor_member_id: null,
    actor_is_admin: false,
  }));
  if (notificationRows.length) await db.from("team_notifications").insert(notificationRows);

  const [hydrated] = await hydrateTeamMessages([message]);
  return NextResponse.json({ ok: true, message: hydrated });
}
