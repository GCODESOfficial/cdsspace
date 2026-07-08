/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";
import { closeStaleCmeets } from "@/lib/cmeet-autoclose";

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
      agenda: agenda?.trim() || null,
      scheduled_for: scheduled_for || null,
      created_by: team?.id || null,
      created_by_admin: !!admin,
      status: "scheduled",
    })
    .select("id, room_code")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Creator is automatically a participant (if team member)
  const participantRows: { meeting_id: string; team_member_id: string }[] = [];
  if (team) participantRows.push({ meeting_id: meeting.id, team_member_id: team.id });
  if (Array.isArray(participant_ids)) {
    for (const pid of participant_ids) {
      if (pid && pid !== team?.id) participantRows.push({ meeting_id: meeting.id, team_member_id: pid });
    }
  }
  if (participantRows.length > 0) {
    await db.from("team_meeting_participants").upsert(participantRows, { onConflict: "meeting_id,team_member_id" });
  }

  // Fire cmeet_invite notifications
  if (Array.isArray(participant_ids) && participant_ids.length > 0) {
    const notifs = participant_ids
      .filter((pid: string) => pid && pid !== team?.id)
      .map((pid: string) => ({
        recipient_id: pid,
        kind: "cmeet_invite",
        title: `You've been invited to: ${title.trim()}`,
        body: scheduled_for ? `Scheduled for ${new Date(scheduled_for).toLocaleString()}` : "Time not set",
        link: `/team/cmeet/${meeting.room_code}`,
        actor_member_id: team?.id || null,
        actor_is_admin: !!admin,
        meeting_id: meeting.id,
      }));
    if (notifs.length > 0) await db.from("team_notifications").insert(notifs);
  }

  return NextResponse.json({ ok: true, id: meeting.id, room_code: meeting.room_code });
}
