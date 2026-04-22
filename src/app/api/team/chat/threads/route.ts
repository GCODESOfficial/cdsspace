/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getChatViewer } from "@/lib/team-chat-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list threads the viewer can see, newest-activity first.
//   - Admin sees every thread.
//   - Team member sees threads they're a participant in + all department/broadcast threads.
export async function GET() {
  const viewer = await getChatViewer();
  if (!viewer || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin as any;

  let threadIdFilter: string[] | null = null;
  if (viewer.kind === "team") {
    // Thread ids the member is a participant in
    const { data: parts } = await db
      .from("team_chat_participants")
      .select("thread_id")
      .eq("team_member_id", viewer.session.id);
    const partIds = (parts || []).map((p: any) => p.thread_id);

    // Plus all department/broadcast threads
    const { data: openThreads } = await db
      .from("team_chat_threads")
      .select("id")
      .in("kind", ["department", "admin_broadcast"]);
    const openIds = (openThreads || []).map((t: any) => t.id);

    threadIdFilter = Array.from(new Set([...partIds, ...openIds]));
    if (threadIdFilter.length === 0) {
      return NextResponse.json({ ok: true, threads: [] });
    }
  }

  let query = db
    .from("team_chat_threads")
    .select("id, kind, name, department, includes_admin, created_at")
    .order("created_at", { ascending: false });
  if (threadIdFilter) query = query.in("id", threadIdFilter);

  const { data: threads, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Hydrate last message + unread count
  const threadIds = (threads || []).map((t: any) => t.id);
  const latest: Record<string, any> = {};
  const unread: Record<string, number> = {};

  if (threadIds.length) {
    const { data: lastMsgs } = await db
      .from("team_chat_messages")
      .select("id, thread_id, body, sender_id, sender_is_admin, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });
    (lastMsgs || []).forEach((m: any) => {
      if (!latest[m.thread_id]) latest[m.thread_id] = m;
    });

    // Unread for team members (admins: skip)
    if (viewer.kind === "team") {
      const { data: myParts } = await db
        .from("team_chat_participants")
        .select("thread_id, last_read_at")
        .eq("team_member_id", viewer.session.id)
        .in("thread_id", threadIds);
      const readMap: Record<string, string | null> = {};
      (myParts || []).forEach((p: any) => {
        readMap[p.thread_id] = p.last_read_at;
      });
      (lastMsgs || []).forEach((m: any) => {
        const rd = readMap[m.thread_id];
        if (!rd || new Date(m.created_at) > new Date(rd)) {
          if (m.sender_id !== viewer.session.id) {
            unread[m.thread_id] = (unread[m.thread_id] || 0) + 1;
          }
        }
      });
    }
  }

  const hydrated = (threads || []).map((t: any) => ({
    ...t,
    last_message: latest[t.id] || null,
    unread_count: unread[t.id] || 0,
  }));

  // Sort by last activity (latest message OR created_at as fallback)
  hydrated.sort((a: any, b: any) => {
    const ta = a.last_message?.created_at || a.created_at;
    const tb = b.last_message?.created_at || b.created_at;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  return NextResponse.json({ ok: true, threads: hydrated, viewer: { kind: viewer.kind } });
}

// POST — create a direct / group thread. Kind='department' threads are
// created via /api/admin/departments.
export async function POST(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { kind, name, participant_ids } = await req.json().catch(() => ({}));
  if (!["direct", "group", "admin_broadcast"].includes(kind)) {
    return NextResponse.json({ ok: false, error: "Invalid thread kind" }, { status: 400 });
  }
  if (kind === "admin_broadcast" && viewer.kind !== "admin") {
    return NextResponse.json({ ok: false, error: "Only admin can broadcast" }, { status: 403 });
  }
  if (kind === "group" && !name?.trim()) {
    return NextResponse.json({ ok: false, error: "Group name is required" }, { status: 400 });
  }
  if (!Array.isArray(participant_ids) || participant_ids.length === 0) {
    return NextResponse.json({ ok: false, error: "Pick at least one participant" }, { status: 400 });
  }

  const db = supabaseAdmin as any;
  const { data: thread, error } = await db
    .from("team_chat_threads")
    .insert({
      kind,
      name: name?.trim() || null,
      created_by: viewer.kind === "team" ? viewer.session.id : null,
      includes_admin: viewer.kind === "admin",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const allParticipants = new Set<string>(participant_ids);
  if (viewer.kind === "team") allParticipants.add(viewer.session.id);

  // Broadcast: add every active team member
  if (kind === "admin_broadcast") {
    const { data: all } = await db.from("team_members").select("id").eq("is_active", true);
    (all || []).forEach((m: any) => allParticipants.add(m.id));
  }

  const rows = Array.from(allParticipants).map((mid) => ({ thread_id: thread.id, team_member_id: mid }));
  if (rows.length) await db.from("team_chat_participants").insert(rows).select();

  return NextResponse.json({ ok: true, thread_id: thread.id });
}
