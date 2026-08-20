/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getChatViewer } from "@/lib/team-chat-auth";
import { describeTeamMessage, getTeamChatDb, getViewerPayload } from "@/lib/team-chat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THREAD_COLUMNS =
  "id, kind, name, department, includes_admin, visibility, description, rules, invite_code, is_announcement_only, is_voice_room, is_voice_channel, pinned_message_id, project_id, created_at, updated_at";

// GET - list threads the viewer can see, newest-activity first.
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
      .or("kind.eq.admin_broadcast,visibility.eq.public");
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
    .select("id, kind, name, department, includes_admin, visibility, description, rules, invite_code, is_announcement_only, is_voice_room, is_voice_channel, pinned_message_id, project_id, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (threadIdFilter) {
    query = query.in("id", threadIdFilter);
  } else if (superAdminHideDirectsOfOthers) {
    // Filter specifically for Super Admin to respect member privacy
    // Show all groups/broadcasts/departments, but for 'direct', only if includes_admin is true
    // In PostgREST/Supabase, a complex OR filter is easiest with .or()
    query = query.or(`kind.in.(group,department,admin_broadcast),visibility.eq.public,and(kind.eq.direct,includes_admin.eq.true)`);
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
        .select("id, thread_id, body, attachment_url, sticker_key, deleted_at, sender_id, sender_is_admin, delivery_status, created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false }),
      db.from("team_chat_participants")
        .select("thread_id, team_member_id")
        .in("thread_id", threadIds)
    ]);

    const lastMsgs = lastMsgsRes.data || [];
    lastMsgs.forEach((m: any) => {
      if (!latest[m.thread_id]) latest[m.thread_id] = m;
    });

    const threadParts = partsRes.data || [];

    // Resolve member names via a separate lookup - the GlashDB shim does not
    // support PostgREST embedded joins (team_members(full_name)), so we fetch
    // names by id, the same way hydrateTeamMessages does.
    const memberIds = Array.from(
      new Set(threadParts.map((p: any) => p.team_member_id).filter(Boolean)),
    ) as string[];
    const nameById: Record<string, string> = {};
    if (memberIds.length) {
      const { data: members } = await db.from("team_members").select("id, full_name").in("id", memberIds);
      (members || []).forEach((m: any) => {
        if (m.full_name) nameById[m.id] = m.full_name;
      });
    }

    // For direct threads, find the "other" person's name
    threads?.forEach((t: any) => {
      if (t.kind === "direct") {
        const parts = threadParts.filter((p: any) => p.thread_id === t.id);
        if (viewer.kind === "admin") {
          const other = parts.find((p: any) => nameById[p.team_member_id]);
          if (other) participantNames[t.id] = nameById[other.team_member_id];
        } else {
          const myId = viewer.kind === "team" ? viewer.session.id : null;
          const other = parts.find((p: any) => p.team_member_id !== myId && nameById[p.team_member_id]);
          if (other) participantNames[t.id] = nameById[other.team_member_id];
          else if (t.includes_admin) participantNames[t.id] = "Admin";
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

// POST - unchanged
export async function POST(req: Request) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const {
    kind,
    name,
    participant_ids,
    department,
    project_id,
    visibility,
    description,
    rules,
    is_announcement_only,
    is_voice_room,
    is_voice_channel,
  } = await req.json().catch(() => ({}));
  if (!["self", "direct", "group", "department", "project", "admin_broadcast"].includes(kind)) {
    return NextResponse.json({ ok: false, error: "Invalid thread kind" }, { status: 400 });
  }
  const storedKind = kind === "project" || kind === "self" ? "direct" : kind;
  
  const isSuperAdmin = viewer.kind === "admin" && viewer.role === "super_admin";
  if (kind === "admin_broadcast" && !isSuperAdmin) {
    return NextResponse.json({ ok: false, error: "Only super admin can broadcast" }, { status: 403 });
  }

  // Group creation (and by extension adding members to a group) is
  // admin-only. Team members can only start direct messages; groups must
  // be orchestrated by an admin so the roster stays intentional.
  if (["group", "department", "project"].includes(kind) && viewer.kind !== "admin") {
    return NextResponse.json({ ok: false, error: "Only admins can create team channels" }, { status: 403 });
  }

  if (kind === "group" && !name?.trim()) {
    return NextResponse.json({ ok: false, error: "Group name is required" }, { status: 400 });
  }
  if (kind === "department" && !String(department || "").trim()) {
    return NextResponse.json({ ok: false, error: "Department is required" }, { status: 400 });
  }
  if (kind === "project" && !String(project_id || "").trim()) {
    return NextResponse.json({ ok: false, error: "Project is required" }, { status: 400 });
  }
  if ((kind === "direct" || kind === "group") && (!Array.isArray(participant_ids) || participant_ids.length === 0)) {
    return NextResponse.json({ ok: false, error: "Pick at least one participant" }, { status: 400 });
  }

  if (kind === "self") {
    if (viewer.kind === "team") {
      const { data: existing } = await db
        .from("team_chat_threads")
        .select("id")
        .eq("kind", "direct")
        .eq("name", "Saved messages")
        .eq("created_by", viewer.session.id)
        .maybeSingle();
      if (existing?.id) return NextResponse.json({ ok: true, thread_id: existing.id });
    }
    if (viewer.kind === "admin") {
      const { data: existing } = await db
        .from("team_chat_threads")
        .select("id")
        .eq("kind", "direct")
        .eq("name", "Saved messages")
        .eq("includes_admin", true)
        .maybeSingle();
      if (existing?.id) return NextResponse.json({ ok: true, thread_id: existing.id });
    }
  }

  const selectedParticipantIds = Array.isArray(participant_ids) ? participant_ids : [];
  const hasAdmin = selectedParticipantIds.includes("admin");
  const realUserIds = selectedParticipantIds.filter((id: any) => id !== "admin");

  let resolvedName = name?.trim() || null;
  if (kind === "self") resolvedName = "Saved messages";
  if (kind === "department" && !resolvedName) resolvedName = `${String(department).trim()} Department`;
  if (kind === "project") {
    const { data: project } = await db
      .from("finance_projects")
      .select("name")
      .eq("id", project_id)
      .maybeSingle();
    resolvedName = resolvedName || project?.name || "Project Chat";
  }

  const { data: thread, error } = await db
    .from("team_chat_threads")
    .insert({
      kind: storedKind,
      name: resolvedName,
      department: kind === "department" ? String(department).trim() : null,
      project_id: kind === "project" ? project_id : null,
      created_by: viewer.kind === "team" ? viewer.session.id : null,
      includes_admin: viewer.kind === "admin" || hasAdmin,
      visibility: ["public", "private", "invite_only"].includes(String(visibility)) ? String(visibility) : "private",
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      rules: typeof rules === "string" && rules.trim() ? rules.trim() : null,
      is_announcement_only: !!is_announcement_only,
      is_voice_room: !!is_voice_room,
      is_voice_channel: !!is_voice_channel,
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

  if (kind === "department") {
    const { data: deptMembers } = await db
      .from("team_members")
      .select("id")
      .eq("is_active", true)
      .eq("department", String(department).trim());
    (deptMembers || []).forEach((m: any) => allParticipants.add(m.id));
  }

  if (kind === "project") {
    const { data: assigned } = await db
      .from("project_assignments")
      .select("team_member_id")
      .eq("project_id", project_id);
    (assigned || []).forEach((assignment: any) => {
      if (assignment.team_member_id) allParticipants.add(assignment.team_member_id);
    });
  }

  const rows = Array.from(allParticipants).map((mid) => ({
    thread_id: thread.id,
    team_member_id: mid,
    role: kind === "self" ? "owner" : "member",
  }));
  if (rows.length) await db.from("team_chat_participants").insert(rows).select();

  return NextResponse.json({ ok: true, thread_id: thread.id });
}

// PATCH - manage an existing thread: rename, change visibility ("Mode"),
// toggle announcement mode, and generate/clear the invite code ("Invite").
// Allowed for admins, the thread's creator, or management (sub-admins).
export async function PATCH(req: Request) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const threadId = String(body?.threadId || body?.thread_id || "");
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });

  const { data: thread } = await db
    .from("team_chat_threads")
    .select("id, created_by")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return NextResponse.json({ ok: false, error: "Thread not found" }, { status: 404 });

  const isAdmin = viewer.kind === "admin";
  const isCreator = viewer.kind === "team" && thread.created_by === viewer.session.id;
  const isManagement = isAdmin || (viewer.kind === "team" && !!viewer.session.is_sub_admin);
  if (!isAdmin && !isCreator && !isManagement) {
    return NextResponse.json({ ok: false, error: "You do not manage this conversation." }, { status: 403 });
  }

  const updates: Record<string, any> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.description === "string") updates.description = body.description.trim() || null;
  if (["public", "private", "invite_only"].includes(String(body.visibility))) {
    updates.visibility = String(body.visibility);
  }
  if (typeof body.is_announcement_only === "boolean") updates.is_announcement_only = body.is_announcement_only;
  if (body.generateInvite === true) updates.invite_code = randomUUID().replace(/-/g, "").slice(0, 10);
  if (body.clearInvite === true) updates.invite_code = null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "No changes provided." }, { status: 400 });
  }

  const { data: updated, error } = await db
    .from("team_chat_threads")
    .update(updates)
    .eq("id", threadId)
    .select(THREAD_COLUMNS)
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, thread: updated });
}
