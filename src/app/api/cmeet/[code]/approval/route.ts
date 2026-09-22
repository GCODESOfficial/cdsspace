/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getToolActor } from "@/lib/team-tools-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildCMeetPath } from "@/lib/cmeet-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const actor = await getToolActor();
  if (actor?.kind !== "admin") {
    return NextResponse.json({ ok: false, error: "Only an admin can approve cMeet requests." }, { status: 403 });
  }
  const db = getSupabaseAdmin() as any;
  if (!db) return NextResponse.json({ ok: false, error: "Meeting service is unavailable." }, { status: 503 });

  const { code } = await params;
  const body = await req.json().catch(() => ({}));
  const decision = body.decision === "reject" ? "reject" : body.decision === "approve" ? "approve" : null;
  if (!decision) return NextResponse.json({ ok: false, error: "Choose approve or reject." }, { status: 400 });

  const { data: meeting, error: loadError } = await db
    .from("team_meetings")
    .select("id, room_code, title, scheduled_for, status, approval_status, created_by, created_by_client")
    .eq("room_code", code)
    .maybeSingle();
  if (loadError) return NextResponse.json({ ok: false, error: loadError.message }, { status: 500 });
  if (!meeting) return NextResponse.json({ ok: false, error: "Meeting not found." }, { status: 404 });
  if (meeting.approval_status !== "pending") {
    return NextResponse.json({ ok: false, error: `This meeting is already ${meeting.approval_status}.` }, { status: 409 });
  }

  const now = new Date();
  const scheduled = meeting.scheduled_for && new Date(meeting.scheduled_for).getTime() > now.getTime();
  const updates = decision === "approve"
    ? {
        approval_status: "approved",
        approved_at: now.toISOString(),
        approved_by_email: actor.email,
        status: scheduled ? "scheduled" : "live",
        started_at: scheduled ? null : now.toISOString(),
      }
    : {
        approval_status: "rejected",
        approved_at: null,
        approved_by_email: actor.email,
        status: "cancelled",
        ended_at: now.toISOString(),
      };

  const { data: updated, error } = await db
    .from("team_meetings")
    .update(updates)
    .eq("id", meeting.id)
    .eq("approval_status", "pending")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: false, error: "This request was already handled." }, { status: 409 });

  if (meeting.created_by) {
    await db.from("team_notifications").insert({
      recipient_id: meeting.created_by,
      kind: "cmeet_approval",
      title: decision === "approve" ? `Meeting approved: ${meeting.title}` : `Meeting declined: ${meeting.title}`,
      body: decision === "approve"
        ? scheduled ? `Approved for ${new Date(meeting.scheduled_for).toLocaleString()}` : "Your meeting can start now."
        : "An admin declined this meeting request.",
      link: decision === "approve" ? buildCMeetPath(meeting.room_code, meeting.title) : "/team/cmeet",
      meeting_id: meeting.id,
      actor_member_id: null,
      actor_is_admin: true,
    });
  }

  if (decision === "approve") {
    const { data: participants } = await db
      .from("team_meeting_participants")
      .select("team_member_id")
      .eq("meeting_id", meeting.id);
    const recipients = (participants || [])
      .map((entry: any) => entry.team_member_id)
      .filter((id: string) => id && id !== meeting.created_by);
    if (recipients.length) {
      await db.from("team_notifications").insert(recipients.map((recipientId: string) => ({
        recipient_id: recipientId,
        kind: "cmeet_invite",
        title: `You're invited: ${meeting.title}`,
        body: scheduled ? `Scheduled for ${new Date(meeting.scheduled_for).toLocaleString()}` : "Approved and live now",
        link: buildCMeetPath(meeting.room_code, meeting.title),
        meeting_id: meeting.id,
        actor_member_id: null,
        actor_is_admin: true,
      })));
    }
  }

  return NextResponse.json({ ok: true, meeting: updated });
}
