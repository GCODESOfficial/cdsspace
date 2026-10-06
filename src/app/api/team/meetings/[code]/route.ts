/* eslint-disable @typescript-eslint/no-explicit-any */
import { after, NextResponse } from "next/server";
import { cancelCallOnPhones, ringCallOnPhones } from "@/lib/mobile-call-push";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { code } = await params;
  const db = supabaseAdmin as any;

  const [admin, team] = await Promise.all([getAdminSession(), getTeamSession()]);
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: meeting } = await db
    .from("team_meetings")
    .select("*")
    .eq("room_code", code)
    .maybeSingle();
  if (!meeting) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: participants } = await db
    .from("team_meeting_participants")
    .select("team_member_id, joined_at, left_at")
    .eq("meeting_id", meeting.id);

  const memberIds = (participants || []).map((p: any) => p.team_member_id);
  let members: any[] = [];
  if (memberIds.length > 0) {
    const { data: ms } = await db
      .from("team_members")
      .select("id, full_name, username, avatar_url, role_title")
      .in("id", memberIds);
    members = ms || [];
  }

  const mergedParticipants = (participants || []).map((p: any) => ({
    ...p,
    member: members.find((m: any) => m.id === p.team_member_id) || null,
  }));

  return NextResponse.json({
    ok: true,
    meeting,
    participants: mergedParticipants,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { code } = await params;
  const db = supabaseAdmin as any;

  const [admin, team] = await Promise.all([getAdminSession(), getTeamSession()]);
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { action } = body; // "join" | "leave" | "start" | "end" | "cancel"

  const { data: meeting } = await db
    .from("team_meetings")
    .select("id, status, created_by")
    .eq("room_code", code)
    .maybeSingle();
  if (!meeting) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (action === "join" && team) {
    await db
      .from("team_meeting_participants")
      .upsert(
        { meeting_id: meeting.id, team_member_id: team.id, joined_at: new Date().toISOString(), left_at: null },
        { onConflict: "meeting_id,team_member_id" }
      );
    // Answered here: stop it ringing on this member's other phones.
    after(() => cancelCallOnPhones(meeting.id, { subjects: [`team:${team.id}`, `admin:${team.id}`] }));
    return NextResponse.json({ ok: true });
  }

  if (action === "leave" && team) {
    await db
      .from("team_meeting_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("meeting_id", meeting.id)
      .eq("team_member_id", team.id);
    return NextResponse.json({ ok: true });
  }

  const isCreator = team && meeting.created_by === team.id;
  if (action === "start" && !admin) {
    return NextResponse.json({ ok: false, error: "Only an admin can approve and start a cMeet." }, { status: 403 });
  }
  if ((action === "start" && admin) || ((action === "end" || action === "cancel") && (admin || isCreator))) {
    const now = new Date().toISOString();
    const updates: Record<string, any> = {};
    if (action === "start") {
      updates.status = "live";
      updates.started_at = now;
      updates.approval_status = "approved";
      updates.approved_at = now;
      updates.approved_by_email = admin?.email || null;
    } else if (action === "end") {
      updates.status = "ended";
      updates.ended_at = now;
    } else {
      updates.status = "cancelled";
    }
    await db.from("team_meetings").update(updates).eq("id", meeting.id);
    after(() => (action === "start" ? ringCallOnPhones(meeting.id) : cancelCallOnPhones(meeting.id)));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
}
