/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-api-auth";
import { buildCMeetPath, normalizeCMeetTopic } from "@/lib/cmeet-links";

const ADJ = ["quick", "calm", "bright", "rapid", "deep", "bold", "clever", "warm", "kind", "gentle", "mighty", "cool"];
const NOUN = ["bird", "river", "forest", "mountain", "cloud", "star", "fox", "lion", "tiger", "bear", "wolf", "eagle"];
function genRoomCode() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const d = Math.floor(Math.random() * 89) + 10;
  return `${a}-${n}-${d}`;
}

function futureIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return null;
  return date.toISOString();
}

// Create or update the scheduled cMeet room behind a consultation. Reusing an
// existing scheduled room keeps invitation links stable and avoids orphaned
// rooms whenever an admin adjusts the topic or appointment time.
async function upsertCmeetRoom(
  sb: any,
  consultation: any,
  scheduledAt: string,
  meetingTopic: string,
) {
  if (consultation.meeting_room_code) {
    const { data: existing } = await sb
      .from("team_meetings")
      .select("id, room_code, guest_token, status")
      .eq("room_code", consultation.meeting_room_code)
      .maybeSingle();
    if (existing?.status === "scheduled") {
      const guestToken = existing.guest_token || crypto.randomUUID().replace(/-/g, "");
      const { error } = await sb.from("team_meetings").update({
        title: meetingTopic,
        agenda: consultation.message || null,
        scheduled_for: scheduledAt,
        guest_email: consultation.email || null,
        guest_token: guestToken,
      }).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return {
        roomCode: existing.room_code,
        link: buildCMeetPath(existing.room_code, meetingTopic, guestToken),
      };
    }
  }

  let roomCode = genRoomCode();
  for (let i = 0; i < 4; i += 1) {
    const { data: existing } = await sb.from("team_meetings").select("id").eq("room_code", roomCode).maybeSingle();
    if (!existing) break;
    roomCode = genRoomCode();
  }
  // The invited client skips the lobby. The token is their proof of invitation
  // when they have no account, so it travels only in the link we send them.
  const guestToken = crypto.randomUUID().replace(/-/g, "");
  const { error } = await sb.from("team_meetings").insert({
    room_code: roomCode,
    title: meetingTopic,
    agenda: consultation.message || null,
    scheduled_for: scheduledAt,
    created_by: null,
    created_by_admin: true,
    status: "scheduled",
    started_at: null,
    guest_email: consultation.email || null,
    guest_token: guestToken,
  });
  if (error) throw new Error(error.message);
  return { roomCode, link: buildCMeetPath(roomCode, meetingTopic, guestToken) };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "consultations.manage");
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sb: any = getSupabaseAdmin();

  const allowed = ["status", "notes", "scheduled_at", "meeting_type", "meeting_link", "meeting_topic"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];

  if ("meeting_topic" in patch) patch.meeting_topic = normalizeCMeetTopic(patch.meeting_topic) || null;
  if ("scheduled_at" in patch) {
    if (patch.scheduled_at) {
      const normalized = futureIso(patch.scheduled_at);
      if (!normalized) return NextResponse.json({ error: "Choose a valid future date and time." }, { status: 400 });
      patch.scheduled_at = normalized;
    } else {
      patch.scheduled_at = null;
    }
  }
  if ("meeting_type" in patch && !["none", "cmeet", "zoom", "google_meet", "other"].includes(String(patch.meeting_type))) {
    return NextResponse.json({ error: "Choose a supported meeting platform." }, { status: 400 });
  }

  // Generate or synchronize a cMeet room and its consultation in one request.
  if (body.generate_cmeet) {
    const { data: current, error: loadErr } = await sb
      .from("consultation_requests")
      .select("full_name, email, message, meeting_topic, meeting_room_code")
      .eq("id", id)
      .single();
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    const scheduledAt = futureIso(patch.scheduled_at ?? body.scheduled_at);
    if (!scheduledAt) {
      return NextResponse.json({ error: "A future date and time is required before scheduling cMeet." }, { status: 400 });
    }
    const meetingTopic = normalizeCMeetTopic(patch.meeting_topic ?? body.meeting_topic ?? current.meeting_topic)
      || `Consultation with ${current.full_name}`;
    try {
      const { roomCode, link } = await upsertCmeetRoom(sb, current, scheduledAt, meetingTopic);
      patch.meeting_type = "cmeet";
      patch.meeting_link = link;
      patch.meeting_room_code = roomCode;
      patch.meeting_topic = meetingTopic;
      patch.scheduled_at = scheduledAt;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create cMeet room" }, { status: 500 });
    }
  }

  // Moving a consultation away from cMeet cancels only its unused scheduled
  // room. Live and completed meeting history is left untouched.
  if (!body.generate_cmeet && "meeting_type" in patch && patch.meeting_type !== "cmeet") {
    const { data: current } = await sb
      .from("consultation_requests")
      .select("meeting_room_code, status")
      .eq("id", id)
      .maybeSingle();
    if (current?.meeting_room_code) {
      await sb.from("team_meetings")
        .update({ status: "cancelled" })
        .eq("room_code", current.meeting_room_code)
        .eq("status", "scheduled");
      patch.meeting_room_code = null;
      if (patch.meeting_type === "none") patch.meeting_link = null;
    }
    if (patch.meeting_type === "none" && current?.status === "scheduled" && !("status" in patch)) {
      patch.status = "reviewing";
    }
  }

  // Booking a meeting moves the request to "scheduled" unless already resolved.
  if ((patch.meeting_link || patch.scheduled_at) && !("status" in patch)) {
    const { data: cur } = await sb.from("consultation_requests").select("status").eq("id", id).single();
    if (cur && !["completed", "archived"].includes(cur.status)) patch.status = "scheduled";
  }

  const { data, error } = await sb.from("consultation_requests").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ consultation: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "consultations.delete");
  if (denied) return denied;
  const { id } = await params;
  const sb: any = getSupabaseAdmin();
  const { data: current } = await sb
    .from("consultation_requests")
    .select("meeting_room_code")
    .eq("id", id)
    .maybeSingle();
  if (current?.meeting_room_code) {
    await sb.from("team_meetings")
      .update({ status: "cancelled" })
      .eq("room_code", current.meeting_room_code)
      .eq("status", "scheduled");
  }
  const { error } = await sb.from("consultation_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
