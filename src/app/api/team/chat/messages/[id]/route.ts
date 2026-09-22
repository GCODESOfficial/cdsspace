import { NextResponse } from "next/server";
import { getChatViewer, viewerIsSuperAdmin } from "@/lib/team-chat-auth";
import {
  canDeleteTeamMessage,
  canEditTeamMessage,
  canViewTeamThread,
  getTeamChatDb,
  hydrateTeamMessages,
  TEAM_CHAT_MESSAGE_COLUMNS,
  type TeamChatMessageRecord,
} from "@/lib/team-chat-server";
import { purgeChatAttachment } from "@/lib/chat-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getMessage(id: string) {
  const db = getTeamChatDb();
  if (!db) return null;

  const { data } = await db
    .from("team_chat_messages")
    .select(TEAM_CHAT_MESSAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return (data || null) as TeamChatMessageRecord | null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const message = await getMessage(id);
  if (!message) {
    return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
  }
  if (!(await canViewTeamThread(viewer, message.thread_id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!canEditTeamMessage(viewer, message)) {
    return NextResponse.json({ ok: false, error: "You cannot edit this message" }, { status: 403 });
  }

  const { body } = await req.json().catch(() => ({}));
  const trimmed = typeof body === "string" ? body.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ ok: false, error: "Message body required" }, { status: 400 });
  }
  if (message.sticker_key || (!message.body && message.attachment_url)) {
    return NextResponse.json({ ok: false, error: "Only text messages can be edited" }, { status: 400 });
  }

  const { data, error } = await db
    .from("team_chat_messages")
    .update({
      body: trimmed,
      edited_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(TEAM_CHAT_MESSAGE_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const [updated] = await hydrateTeamMessages([data]);
  return NextResponse.json({ ok: true, message: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const message = await getMessage(id);
  if (!message) {
    return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
  }
  if (!(await canViewTeamThread(viewer, message.thread_id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!canDeleteTeamMessage(viewer, message)) {
    return NextResponse.json({ ok: false, error: "You cannot delete this message" }, { status: 403 });
  }

  if (viewerIsSuperAdmin(viewer)) {
    await purgeChatAttachment(message.attachment_url).catch(() => undefined);
    const { error } = await db.from("team_chat_messages").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, hardDeleted: true, messageId: id });
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("team_chat_messages")
    .update({
      body: null,
      attachment_url: null,
      sticker_key: null,
      forwarded: null,
      edited_at: null,
      deleted_at: now,
      reactions: {},
      delivery_status: "deleted",
    })
    .eq("id", id)
    .select(TEAM_CHAT_MESSAGE_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const [updated] = await hydrateTeamMessages([data]);
  return NextResponse.json({ ok: true, message: updated });
}
