/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getChatViewer } from "@/lib/team-chat-auth";
import { describeTeamMessage, getTeamChatDb, getViewerPayload } from "@/lib/team-chat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list threads the viewer can see, newest-activity first.
//   - Super Admin: sees all Group/Dept/Broadcast threads, plus Direct threads involving an admin.
//   - Sub-Admin / Team Member: only sees threads they're an explicit participant in, plus broadcasts.
export async function GET() {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const isSuperAdmin = viewer.kind === "admin" && viewer.role === "super_admin";
  let threadIdFilter: string[] | null = null;
  let superAdminHideDirectsOfOthers = false;

  if (!isSuperAdmin) {
    let participantThreadIds: string[] = [];

    // 1. Threads where they are a participant (Direct messages + Groups where they're added)
    if (viewer.kind === "team") {
      const { data: parts } = await db
        .from("team_chat_participants")
        .select("thread_id")
        .eq("team_member_id", viewer.session.id);
      participantThreadIds = (parts || []).map((p: any) => p.thread_id);
    }

    // 2. Plus all broadcast threads
    const { data: broadcastThreads } = await db
      .from("team_chat_threads")
      .select("id")
      .eq("kind", "admin_broadcast");
    const broadcastIds = (broadcastThreads || []).map((t: any) => t.id);

    threadIdFilter = Array.from(new Set([...participantThreadIds, ...broadcastIds]));
    
    if (threadIdFilter.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        threads: [], 
        viewer: getViewerPayload(viewer),
      });
    }
  } else {
    // Super Admin: Hide direct messages that don't involve an admin
    superAdminHideDirectsOfOthers = true;
  }

  let query = db
    .from("team_chat_threads")
    .select("id, kind, name, department, includes_admin, created_at")
    .order("created_at", { ascending: false });

  if (threadIdFilter) {
    query = query.in("id", threadIdFilter);
  } else if (superAdminHideDirectsOfOthers) {
    // Filter specifically for Super Admin to respect member privacy
    // Show all groups/broadcasts/departments, but for 'direct', only if includes_admin is true
    // In PostgREST/Supabase, a complex OR filter is easiest with .or()
    query = query.or(`kind.in.(group,department,admin_broadcast),and(kind.eq.direct,includes_admin.eq.true)`);
  }

  const { data: threads, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Hydrate last message + unread count
  const threadIds = (threads || []).map((t: any) => t.id);
  const latest: Record<string, any> = {};
  const unread: Record<string, number> = {};
  const participantNames: Record<string, string> = {};

  if (threadIds.length) {
    const [lastMsgsRes, partsRes] = await Promise.all([
      db.from("team_chat_messages")
        .select("id, thread_id, body, attachment_url, sticker_key, deleted_at, sender_id, sender_is_admin, created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false }),
      db.from("team_chat_participants")
        .select("thread_id, team_member_id, team_members(full_name)")
        .in("thread_id", threadIds)
    ]);

    const lastMsgs = lastMsgsRes.data || [];
    lastMsgs.forEach((m: any) => {
      if (!latest[m.thread_id]) latest[m.thread_id] = m;
    });

    const threadParts = partsRes.data || [];

    // For direct threads, find the "other" person's name
    threads?.forEach((t: any) => {
      if (t.kind === "direct") {
        const parts = threadParts.filter((p: any) => p.thread_id === t.id);
        if (viewer.kind === "admin") {
          const other = parts.find((p: any) => p.team_members?.full_name);
          if (other) participantNames[t.id] = other.team_members.full_name;
        } else {
          if (t.includes_admin) {
            participantNames[t.id] = "Admin";
          } else {
            const myId = viewer.kind === "team" ? viewer.session.id : null;
            const other = parts.find((p: any) => p.team_member_id !== myId && p.team_members?.full_name);
            if (other) participantNames[t.id] = other.team_members.full_name;
          }
        }
      }
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
      lastMsgs.forEach((m: any) => {
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
    name: t.name || participantNames[t.id] || null,
    last_message: latest[t.id] || null,
    last_message_preview: latest[t.id] ? describeTeamMessage(latest[t.id]) : "No messages yet",
    unread_count: unread[t.id] || 0,
  }));

  // Sort by last activity
  hydrated.sort((a: any, b: any) => {
    const ta = a.last_message?.created_at || a.created_at;
    const tb = b.last_message?.created_at || b.created_at;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  return NextResponse.json({ 
    ok: true, 
    threads: hydrated, 
    viewer: getViewerPayload(viewer),
  });
}

// POST — unchanged
export async function POST(req: Request) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { kind, name, participant_ids } = await req.json().catch(() => ({}));
  if (!["direct", "group", "admin_broadcast"].includes(kind)) {
    return NextResponse.json({ ok: false, error: "Invalid thread kind" }, { status: 400 });
  }
  
  const isSuperAdmin = viewer.kind === "admin" && viewer.role === "super_admin";
  if (kind === "admin_broadcast" && !isSuperAdmin) {
    return NextResponse.json({ ok: false, error: "Only super admin can broadcast" }, { status: 403 });
  }

  // Group creation (and by extension adding members to a group) is
  // admin-only. Team members can only start direct messages; groups must
  // be orchestrated by an admin so the roster stays intentional.
  if (kind === "group" && viewer.kind !== "admin") {
    return NextResponse.json({ ok: false, error: "Only admins can create group chats" }, { status: 403 });
  }

  if (kind === "group" && !name?.trim()) {
    return NextResponse.json({ ok: false, error: "Group name is required" }, { status: 400 });
  }
  if (!Array.isArray(participant_ids) || participant_ids.length === 0) {
    return NextResponse.json({ ok: false, error: "Pick at least one participant" }, { status: 400 });
  }

  const hasAdmin = participant_ids.includes("admin");
  const realUserIds = participant_ids.filter((id: any) => id !== "admin");

  const { data: thread, error } = await db
    .from("team_chat_threads")
    .insert({
      kind,
      name: name?.trim() || null,
      created_by: viewer.kind === "team" ? viewer.session.id : null,
      includes_admin: viewer.kind === "admin" || hasAdmin,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const allParticipants = new Set<string>(realUserIds);
  if (viewer.kind === "team") allParticipants.add(viewer.session.id);

  if (kind === "admin_broadcast") {
    const { data: all } = await db.from("team_members").select("id").eq("is_active", true);
    (all || []).forEach((m: any) => allParticipants.add(m.id));
  }

  const rows = Array.from(allParticipants).map((mid) => ({ thread_id: thread.id, team_member_id: mid }));
  if (rows.length) await db.from("team_chat_participants").insert(rows).select();

  return NextResponse.json({ ok: true, thread_id: thread.id });
}
