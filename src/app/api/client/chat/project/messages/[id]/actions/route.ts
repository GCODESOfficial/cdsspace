import { NextResponse } from "next/server";
import { getClientChatContext, getClientProjectThread } from "@/lib/client-project-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toggle(values: unknown, key: string, enabled?: boolean) {
  const next = new Set(Array.isArray(values) ? values.map(String) : []);
  const shouldEnable = typeof enabled === "boolean" ? enabled : !next.has(key);
  if (shouldEnable) next.add(key);
  else next.delete(key);
  return Array.from(next);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getClientChatContext();
  if (!context) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { account, db } = context;
  const { data: message } = await db
    .from("team_chat_messages")
    .select("id, thread_id, deleted_at, reactions, starred_by, bookmarked_by")
    .eq("id", id)
    .maybeSingle();
  if (!message) return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
  if (!(await getClientProjectThread(db, account.user.id, message.thread_id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (message.deleted_at) return NextResponse.json({ ok: false, error: "Deleted message" }, { status: 400 });

  const viewerKey = `client:${account.user.id}`;
  const action = String(body.action || "");
  let patch: Record<string, unknown> = {};
  if (action === "react") {
    const emoji = typeof body.emoji === "string" ? body.emoji.slice(0, 12) : "";
    if (!emoji) return NextResponse.json({ ok: false, error: "Choose a reaction" }, { status: 400 });
    const reactions = { ...((message.reactions || {}) as Record<string, string[]>) };
    const users = new Set(reactions[emoji] || []);
    if (users.has(viewerKey)) users.delete(viewerKey);
    else users.add(viewerKey);
    if (users.size) reactions[emoji] = Array.from(users);
    else delete reactions[emoji];
    patch = { reactions };
  } else if (action === "star" || action === "unstar") {
    patch = { starred_by: toggle(message.starred_by, viewerKey, action === "star") };
  } else if (action === "bookmark" || action === "unbookmark") {
    patch = { bookmarked_by: toggle(message.bookmarked_by, viewerKey, action === "bookmark") };
  } else {
    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  }

  const { data: updated, error } = await db
    .from("team_chat_messages")
    .update(patch)
    .eq("id", id)
    .select("id, reactions, starred_by, bookmarked_by")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: updated });
}
