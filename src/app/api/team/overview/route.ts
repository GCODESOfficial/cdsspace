/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getTeamSession();
  if (!session || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin as any;

  // Assigned work count + a few recent
  const { data: assignments } = await db
    .from("team_work_assignments")
    .select("work_id")
    .eq("team_member_id", session.id)
    .in("status", ["active", "completed"]);

  const workIds = (assignments || []).map((a: any) => a.work_id).filter(Boolean);

  let recent_work: any[] = [];
  if (workIds.length > 0) {
    const { data: works } = await db
      .from("works")
      .select("id, title, category, cover_image")
      .in("id", workIds)
      .order("created_at", { ascending: false })
      .limit(5);
    recent_work = works || [];
  }

  // Unread messages count
  const { data: unreadNotifs } = await db
    .from("team_notifications")
    .select("id")
    .eq("recipient_id", session.id)
    .eq("kind", "chat_message")
    .is("read_at", null);
  const unread_messages = unreadNotifs?.length || 0;

  // Upcoming meetings (scheduled or live) where user is participant
  const { data: meetingPart } = await db
    .from("team_meeting_participants")
    .select("meeting_id")
    .eq("team_member_id", session.id);
  const meetingIds = (meetingPart || []).map((m: any) => m.meeting_id);

  let upcoming_meetings: any[] = [];
  if (meetingIds.length > 0) {
    const { data: meetings } = await db
      .from("team_meetings")
      .select("id, title, scheduled_for, room_code, status")
      .in("id", meetingIds)
      .in("status", ["scheduled", "live"])
      .order("scheduled_for", { ascending: true, nullsFirst: false })
      .limit(5);
    upcoming_meetings = meetings || [];
  }

  return NextResponse.json({
    ok: true,
    data: {
      member: { full_name: session.full_name, role_title: session.role_title },
      stats: {
        assigned_work: workIds.length,
        unread_messages,
        upcoming_meetings: upcoming_meetings.length,
      },
      recent_work,
      upcoming_meetings,
    },
  });
}
