import { NextResponse } from "next/server";
import { getChatViewer } from "@/lib/team-chat-auth";
import {
  canViewTeamThread,
  getTeamChatDb,
  getViewerReactionKey,
  type TeamChatMessageRecord,
} from "@/lib/team-chat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { emoji } = await req.json().catch(() => ({}));
  if (!emoji || typeof emoji !== "string") {
    return NextResponse.json({ ok: false, error: "emoji required" }, { status: 400 });
  }

  const { data: message } = await db
    .from("team_chat_messages")
    .select("id, thread_id, reactions, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (!message) {
    return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
  }
  if (!(await canViewTeamThread(viewer, message.thread_id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (message.deleted_at) {
    return NextResponse.json({ ok: false, error: "Deleted messages cannot be reacted to" }, { status: 400 });
  }

  const reactionKey = getViewerReactionKey(viewer);
  const reactions: Record<string, string[]> = ((message as TeamChatMessageRecord).reactions || {}) as Record<
    string,
    string[]
  >;
  const users = new Set(reactions[emoji] || []);
  if (users.has(reactionKey)) users.delete(reactionKey);
  else users.add(reactionKey);

  if (users.size === 0) delete reactions[emoji];
  else reactions[emoji] = Array.from(users);

  const { error } = await db.from("team_chat_messages").update({ reactions }).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reactions });
}
