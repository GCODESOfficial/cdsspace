/* eslint-disable @typescript-eslint/no-explicit-any */
import { after, NextResponse } from "next/server";
import { ringCallOnPhones } from "@/lib/mobile-call-push";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";
import { closeStaleCmeets } from "@/lib/cmeet-autoclose";
import { buildCMeetPath } from "@/lib/cmeet-links";
import { agendaItemsToText, normalizeCMeetAgendaItems } from "@/lib/cmeet-agenda";

export const runtime = "nodejs";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateRoomCode() {
  let s = "CDS-";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export async function GET() {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const db = supabaseAdmin as any;
  await closeStaleCmeets();

  const admin = await getAdminSession();
  if (admin) {
    const { data } = await db
      .from("team_meetings")
      .select("*")
      .order("scheduled_for", { ascending: true, nullsFirst: false });
    return NextResponse.json({ ok: true, actor: "admin", meetings: data || [] });
  }

  const team = await getTeamSession();
  if (!team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Meetings where user is a participant OR they created it
  const { data: parts } = await db
    .from("team_meeting_participants")
    .select("meeting_id")
    .eq("team_member_id", team.id);

  const myIds = (parts || []).map((p: any) => p.meeting_id);

  const { data } = await db
    .from("team_meetings")
    .select("*")
    .or(`created_by.eq.${team.id}${myIds.length ? `,id.in.(${myIds.join(",")})` : ""}`)
    .order("scheduled_for", { ascending: true, nullsFirst: false });

  return NextResponse.json({ ok: true, actor: "team", meetings: data || [] });
}

export async function POST(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });

  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { title, agenda, scheduled_for, participant_ids } = body;
  if (!title?.trim()) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

  const db = supabaseAdmin as any;
  const agendaItems = normalizeCMeetAgendaItems(body.agenda_items ?? agenda);
  // Creating the call makes this actor its host. Team-to-team and personal
  // calls therefore do not need a second admin approval.
  const requiresApproval = false;
  const now = new Date().toISOString();
  const creatorMemberId = team?.id || (admin?.role === "sub_admin" ? admin.memberId || null : null);
  let room_code = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: dup } = await db.from("team_meetings").select("id").eq("room_code", room_code).maybeSingle();
    if (!dup) break;
    room_code = generateRoomCode();
  }

  const { data: meeting, error } = await db
    .from("team_meetings")
    .insert({
      room_code,
      title: title.trim(),
      agenda: agendaItems.length ? agendaItemsToText(agendaItems) : null,
      scheduled_for: scheduled_for || null,
      created_by: creatorMemberId,
      created_by_admin: !!admin,
      status: requiresApproval ? "pending_approval" : scheduled_for ? "scheduled" : "live",
      started_at: requiresApproval || scheduled_for ? null : now,
      approval_status: requiresApproval ? "pending" : "approved",
      approval_requested_at: requiresApproval ? now : null,
      approved_at: requiresApproval ? null : now,
      approved_by_email: admin?.email || null,
    })
    .select("id, room_code, title, scheduled_for, status, approval_status")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (agendaItems.length) {
    const { error: agendaError } = await db.from("team_meeting_agenda_items").insert(
      agendaItems.map((agendaTitle, position) => ({ meeting_id: meeting.id, title: agendaTitle, position })),
    );
    if (agendaError) {
      await db.from("team_meetings").delete().eq("id", meeting.id);
      return NextResponse.json({ ok: false, error: "The meeting agenda could not be saved." }, { status: 500 });
    }
  }

  // Creator is automatically a participant (if team member)
  const participantRows: { meeting_id: string; team_member_id: string }[] = [];
  if (creatorMemberId) participantRows.push({ meeting_id: meeting.id, team_member_id: creatorMemberId });
  if (Array.isArray(participant_ids)) {
    for (const pid of participant_ids) {
      if (pid && pid !== creatorMemberId) participantRows.push({ meeting_id: meeting.id, team_member_id: pid });
    }
  }
  if (participantRows.length > 0) {
    await db.from("team_meeting_participants").upsert(participantRows, { onConflict: "meeting_id,team_member_id" });
  }

  // Fire cmeet_invite notifications
  if (!requiresApproval && Array.isArray(participant_ids) && participant_ids.length > 0) {
    const notifs = participant_ids
      .filter((pid: string) => pid && pid !== creatorMemberId)
      .map((pid: string) => ({
        recipient_id: pid,
        kind: "cmeet_invite",
        title: `You've been invited to: ${title.trim()}`,
        body: scheduled_for ? `Scheduled for ${new Date(scheduled_for).toLocaleString()}` : "Time not set",
        link: buildCMeetPath(meeting.room_code, title.trim()),
        actor_member_id: creatorMemberId,
        actor_is_admin: !!admin,
        meeting_id: meeting.id,
      }));
    if (notifs.length > 0) await db.from("team_notifications").insert(notifs);
  }

  after(() => ringCallOnPhones(meeting.id));
  return NextResponse.json({ ok: true, id: meeting.id, room_code: meeting.room_code, requires_approval: requiresApproval });
}
