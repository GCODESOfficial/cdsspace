/* eslint-disable @typescript-eslint/no-explicit-any */
import { after, NextResponse } from "next/server";
import { ringCallOnPhones } from "@/lib/mobile-call-push";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { closeStaleCmeets } from "@/lib/cmeet-autoclose";
import { buildCMeetPath, normalizeCMeetTopic } from "@/lib/cmeet-links";
import { agendaItemsToText, normalizeCMeetAgendaItems } from "@/lib/cmeet-agenda";
import { getChatViewer, viewerMemberId } from "@/lib/team-chat-auth";
import { canViewTeamThread } from "@/lib/team-chat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADJ = ["quick", "calm", "bright", "rapid", "deep", "bold", "clever", "warm", "kind", "gentle", "mighty", "cool"];
const NOUN = ["bird", "river", "forest", "mountain", "cloud", "star", "fox", "lion", "tiger", "bear", "wolf", "eagle"];

function genRoomCode() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const d = Math.floor(Math.random() * 89) + 10;
  return `${a}-${n}-${d}`;
}

export async function GET(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  await closeStaleCmeets();
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "true";
  const db = supabaseAdmin as any;

  const columns =
    "id, room_code, title, created_by, created_by_admin, started_at, ended_at, scheduled_for, audio_only, archived_at, created_at, status, approval_status, approval_requested_at, approved_at";

  // Admins see every meeting. Team members only see meetings they either
  // created or were tagged as participants on - not every historical call.
  if (actor.kind === "admin") {
    let q = db.from("team_meetings").select(columns).order("created_at", { ascending: false });
    if (!includeArchived) q = q.is("archived_at", null);
    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, meetings: data || [] });
  }

  const { data: parts } = await db
    .from("team_meeting_participants")
    .select("meeting_id")
    .eq("team_member_id", actor.id);
  const myIds = (parts || []).map((p: any) => p.meeting_id).filter(Boolean);

  const filter = myIds.length
    ? `created_by.eq.${actor.id},id.in.(${myIds.join(",")})`
    : `created_by.eq.${actor.id}`;

  let q = db.from("team_meetings").select(columns).or(filter).order("created_at", { ascending: false });
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, meetings: data || [] });
}

/** Bulk archive / restore - body: { ids: string[], action: "archive" | "unarchive" } */
export async function PATCH(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { ids, action } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 });
  }
  if (action !== "archive" && action !== "unarchive") {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }
  const db = supabaseAdmin as any;
  const value = action === "archive" ? new Date().toISOString() : null;
  // Team members may only touch meetings they created; admins act on any.
  let q = db.from("team_meetings").update({ archived_at: value }).in("id", ids);
  if (actor.kind !== "admin") q = q.eq("created_by", actor.id);
  const { data, error } = await q.select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: (data || []).length });
}

/** Bulk delete - body: { ids: string[] }. */
export async function DELETE(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 });
  }
  const db = supabaseAdmin as any;
  // Team members may only delete meetings they created; admins delete any.
  let q = db.from("team_meetings").delete().in("id", ids);
  if (actor.kind !== "admin") q = q.eq("created_by", actor.id);
  const { data, error } = await q.select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: (data || []).length });
}

export async function POST(req: Request) {
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = normalizeCMeetTopic(body.title);
  if (!title) return NextResponse.json({ ok: false, error: "Meeting topic is required." }, { status: 400 });
  let scheduledFor: string | null = null;
  if (body.scheduled_for) {
    const scheduledDate = new Date(String(body.scheduled_for));
    if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Scheduled meetings require a future date and time." }, { status: 400 });
    }
    scheduledFor = scheduledDate.toISOString();
  }
  const db = supabaseAdmin as any;
  const agendaItems = normalizeCMeetAgendaItems(body.agenda_items ?? body.agenda);
  const sourceThreadId = typeof body.source_thread_id === "string" ? body.source_thread_id.trim() : "";
  // The authenticated creator is the host, regardless of whether they are a
  // team member or an admin. Internal/personal calls start without a separate
  // approval queue.
  const requiresApproval = false;
  const now = new Date().toISOString();
  const creatorMemberId = actor.kind === "team"
    ? actor.id
    : actor.role === "sub_admin"
      ? actor.memberId
      : null;

  let room_code = genRoomCode();
  // Guard against the very rare collision
  for (let i = 0; i < 3; i++) {
    const { data: existing } = await db.from("team_meetings").select("id").eq("room_code", room_code).maybeSingle();
    if (!existing) break;
    room_code = genRoomCode();
  }

  const { data, error } = await db
    .from("team_meetings")
    .insert({
      room_code,
      title,
      agenda: agendaItems.length ? agendaItemsToText(agendaItems) : null,
      audio_only: !!body.audio_only,
      scheduled_for: scheduledFor,
      created_by: creatorMemberId,
      created_by_admin: actor.is_admin,
      status: requiresApproval ? "pending_approval" : scheduledFor ? "scheduled" : "live",
      started_at: requiresApproval || scheduledFor ? null : now,
      approval_status: requiresApproval ? "pending" : "approved",
      approval_requested_at: requiresApproval ? now : null,
      approved_at: requiresApproval ? null : now,
      approved_by_email: requiresApproval ? null : actor.email,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (agendaItems.length) {
    const { error: agendaError } = await db.from("team_meeting_agenda_items").insert(
      agendaItems.map((agendaTitle, position) => ({ meeting_id: data.id, title: agendaTitle, position })),
    );
    if (agendaError) {
      await db.from("team_meetings").delete().eq("id", data.id);
      return NextResponse.json({ ok: false, error: "The meeting agenda could not be saved." }, { status: 500 });
    }
  }

  // Calls started from a conversation inherit that conversation's roster.
  // Without this, the chat only receives a link and the people being called
  // have no durable incoming-call state to ring from.
  const requestedIds: string[] = Array.isArray(body.invited_member_ids)
    ? body.invited_member_ids.filter((id: unknown): id is string => typeof id === "string" && Boolean(id))
    : [];
  if (sourceThreadId) {
    const chatViewer = await getChatViewer();
    if (!chatViewer || !(await canViewTeamThread(chatViewer, sourceThreadId))) {
      await db.from("team_meetings").delete().eq("id", data.id);
      return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 403 });
    }
    const { data: threadParticipants, error: participantLookupError } = await db
      .from("team_chat_participants")
      .select("team_member_id")
      .eq("thread_id", sourceThreadId);
    if (participantLookupError) {
      await db.from("team_meetings").delete().eq("id", data.id);
      return NextResponse.json({ ok: false, error: "The call recipients could not be loaded." }, { status: 500 });
    }
    requestedIds.push(
      ...(threadParticipants || [])
        .map((participant: { team_member_id?: string | null }) => participant.team_member_id)
        .filter((id: string | null | undefined): id is string => Boolean(id)),
    );
    const viewerMember = viewerMemberId(chatViewer);
    if (viewerMember) requestedIds.push(viewerMember);
  }

  // Seed invited participants and notify everyone except the caller. The
  // participant row is also what lets the ringtone stop across browser tabs
  // as soon as that member joins.
  const ids = Array.from(new Set(requestedIds));
  if (ids.length) {
    const rows = ids.map((id: string) => ({ meeting_id: data.id, team_member_id: id }));
    const { error: participantError } = await db.from("team_meeting_participants").insert(rows);
    if (participantError) {
      await db.from("team_meetings").delete().eq("id", data.id);
      return NextResponse.json({ ok: false, error: "The call recipients could not be added." }, { status: 500 });
    }
    const notifRows = requiresApproval ? [] : ids
      .filter((id: string) => id !== creatorMemberId)
      .map((id: string) => ({
      recipient_id: id,
      kind: "cmeet_invite",
      title: scheduledFor
        ? `You're invited: ${data.title}`
        : `Incoming ${data.audio_only ? "audio" : "video"} call`,
      body: scheduledFor ? `Scheduled for ${new Date(scheduledFor).toLocaleString()}` : data.title,
      link: buildCMeetPath(data.room_code, data.title),
      meeting_id: data.id,
      actor_member_id: creatorMemberId,
      actor_is_admin: actor.is_admin,
    }));
    if (notifRows.length) await db.from("team_notifications").insert(notifRows);
  }

  // Client-chat calls use the same durable invitation model as team calls.
  // The recipient's dashboard polls these rows, so the ringtone survives page
  // changes and stops on every open tab as soon as the client joins.
  const requestedClientIds: string[] = Array.isArray(body.invited_client_user_ids)
    ? body.invited_client_user_ids.filter((id: unknown): id is string => typeof id === "string" && Boolean(id))
    : [];
  const clientIds = Array.from(new Set(requestedClientIds));
  if (clientIds.length) {
    const { data: validClients } = await db.from("profiles").select("id").in("id", clientIds);
    const validIds = (validClients || []).map((client: { id: string }) => client.id);
    if (validIds.length !== clientIds.length) {
      await db.from("team_meetings").delete().eq("id", data.id);
      return NextResponse.json({ ok: false, error: "One or more call recipients were not found." }, { status: 400 });
    }
    const { error: clientInviteError } = await db.from("cmeet_client_invitations").insert(
      validIds.map((clientUserId: string) => ({ meeting_id: data.id, client_user_id: clientUserId, invited_by: actor.email })),
    );
    if (clientInviteError) {
      await db.from("team_meetings").delete().eq("id", data.id);
      return NextResponse.json({ ok: false, error: "The client call invitation could not be created." }, { status: 500 });
    }
  }

  // A teammate calling a conversation the admin is in (includes_admin): the
  // admin isn't a team member, so isn't among the participants above and was
  // never rung. CDS Space is rung instead, as for a client's call; the first
  // admin to join answers it for everyone.
  if (sourceThreadId && actor.kind === "team" && !scheduledFor) {
    const { data: thread } = await db
      .from("team_chat_threads")
      .select("includes_admin")
      .eq("id", sourceThreadId)
      .maybeSingle();
    if (thread?.includes_admin) {
      await db.from("cmeet_staff_invitations").insert({ meeting_id: data.id });
    }
  }

  // Phones of the people called ring even with the app closed.
  after(() => ringCallOnPhones(data.id));

  return NextResponse.json({
    ok: true,
    meeting: data,
    link: buildCMeetPath(data.room_code, data.title),
    requires_approval: requiresApproval,
  });
}
