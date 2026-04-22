/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getChatViewer } from "@/lib/team-chat-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canViewThread(viewer: Awaited<ReturnType<typeof getChatViewer>>, threadId: string) {
  if (!viewer) return false;
  if (viewer.kind === "admin") return true;
  const db = supabaseAdmin as any;
  const [{ data: thread }, { data: part }] = await Promise.all([
    db.from("team_chat_threads").select("kind").eq("id", threadId).maybeSingle(),
    db.from("team_chat_participants").select("thread_id").eq("thread_id", threadId).eq("team_member_id", viewer.session.id).maybeSingle(),
  ]);
  if (!thread) return false;
  if (part) return true;
  // Department + broadcast threads are open-read for team members
  return thread.kind === "department" || thread.kind === "admin_broadcast";
}

export async function GET(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });

  if (!(await canViewThread(viewer, threadId))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_chat_messages")
    .select("id, thread_id, sender_id, sender_is_admin, body, attachment_url, forwarded, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Hydrate sender names
  const ids = Array.from(new Set((data || []).map((m: any) => m.sender_id).filter(Boolean)));
  const nameById: Record<string, { name: string; avatar: string | null }> = {};
  if (ids.length) {
    const { data: members } = await db
      .from("team_members")
      .select("id, full_name, avatar_url")
      .in("id", ids);
    (members || []).forEach((m: any) => {
      nameById[m.id] = { name: m.full_name, avatar: m.avatar_url };
    });
  }

  const enriched = (data || []).map((m: any) => ({
    ...m,
    sender_name: m.sender_is_admin ? "Admin" : nameById[m.sender_id]?.name || "Member",
    sender_avatar: m.sender_is_admin ? null : nameById[m.sender_id]?.avatar || null,
  }));

  return NextResponse.json({
    ok: true,
    messages: enriched,
    viewer: { kind: viewer.kind, id: viewer.kind === "team" ? viewer.session.id : null },
  });
}

export async function POST(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { threadId, body, attachmentUrl } = await req.json().catch(() => ({}));
  if (!threadId || !(body?.trim() || attachmentUrl)) {
    return NextResponse.json({ ok: false, error: "threadId and body required" }, { status: 400 });
  }
  if (!(await canViewThread(viewer, threadId))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const db = supabaseAdmin as any;
  const { data: msg, error } = await db
    .from("team_chat_messages")
    .insert({
      thread_id: threadId,
      sender_id: viewer.kind === "team" ? viewer.session.id : null,
      sender_is_admin: viewer.kind === "admin",
      body: body?.trim() || null,
      attachment_url: attachmentUrl || null,
    })
    .select("id, thread_id, sender_id, sender_is_admin, body, attachment_url, forwarded, created_at")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Notify other participants
  const { data: parts } = await db
    .from("team_chat_participants")
    .select("team_member_id")
    .eq("thread_id", threadId);
  const { data: thread } = await db.from("team_chat_threads").select("name, kind").eq("id", threadId).maybeSingle();
  const title = thread?.name || (thread?.kind === "direct" ? "Direct message" : "Team chat");
  const notifRows = (parts || [])
    .filter((p: any) => p.team_member_id !== (viewer.kind === "team" ? viewer.session.id : null))
    .map((p: any) => ({
      recipient_id: p.team_member_id,
      kind: "chat_message",
      title: `New message in ${title}`,
      body: body?.slice(0, 120) || "Attachment",
      link: `/team/chat?thread=${threadId}`,
      thread_id: threadId,
      actor_member_id: viewer.kind === "team" ? viewer.session.id : null,
      actor_is_admin: viewer.kind === "admin",
    }));
  if (notifRows.length) await db.from("team_notifications").insert(notifRows);

  return NextResponse.json({
    ok: true,
    message: {
      ...msg,
      sender_name: viewer.kind === "admin" ? "Admin" : viewer.session.full_name,
      sender_avatar: viewer.kind === "admin" ? null : viewer.session.avatar_url,
    },
  });
}
