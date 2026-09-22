/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { closeStaleCmeets } from "@/lib/cmeet-autoclose";
import { buildCMeetPath } from "@/lib/cmeet-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Active instant calls for the signed-in team member.
 *
 * A participant stops being returned after their first successful join. This
 * makes every open dashboard tab stop ringing without relying on a local flag
 * or on whether the notification bell happened to be opened.
 */
export async function GET() {
  const session = await getTeamSession();
  if (!session || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await closeStaleCmeets();
  const db = supabaseAdmin as any;
  const { data: invitations, error: invitationError } = await db
    .from("team_meeting_participants")
    .select("meeting_id, joined_at")
    .eq("team_member_id", session.id)
    .is("joined_at", null);

  if (invitationError) {
    return NextResponse.json({ ok: false, error: invitationError.message }, { status: 500 });
  }

  const meetingIds = (invitations || [])
    .map((invitation: { meeting_id?: string | null }) => invitation.meeting_id)
    .filter((id: string | null | undefined): id is string => Boolean(id));
  if (meetingIds.length === 0) {
    return NextResponse.json({ ok: true, calls: [] });
  }

  const { data: meetings, error: meetingError } = await db
    .from("team_meetings")
    .select("id, room_code, title, audio_only, created_by, created_by_admin, created_at, started_at, status, scheduled_for, ended_at")
    .in("id", meetingIds)
    .eq("status", "live")
    .is("scheduled_for", null)
    .is("ended_at", null)
    .order("created_at", { ascending: false });

  if (meetingError) {
    return NextResponse.json({ ok: false, error: meetingError.message }, { status: 500 });
  }

  const ringingMeetings = (meetings || [])
    .filter((meeting: any) => meeting.created_by !== session.id)
    .slice(0, 5);
  const creatorIds = Array.from(
    new Set(ringingMeetings.map((meeting: any) => meeting.created_by).filter(Boolean)),
  ) as string[];
  const creatorNames = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: creators } = await db
      .from("team_members")
      .select("id, full_name")
      .in("id", creatorIds);
    for (const creator of creators || []) {
      creatorNames.set(creator.id, creator.full_name || "A teammate");
    }
  }

  return NextResponse.json({
    ok: true,
    calls: ringingMeetings.map((meeting: any) => ({
      id: meeting.id,
      roomCode: meeting.room_code,
      title: meeting.title,
      audioOnly: Boolean(meeting.audio_only),
      callerName: meeting.created_by
        ? creatorNames.get(meeting.created_by) || "A teammate"
        : meeting.created_by_admin
          ? "Super admin"
          : "CDS Space",
      startedAt: meeting.started_at || meeting.created_at,
      link: buildCMeetPath(meeting.room_code, meeting.title),
    })),
  });
}
