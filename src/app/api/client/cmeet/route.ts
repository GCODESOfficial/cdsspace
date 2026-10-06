/* eslint-disable @typescript-eslint/no-explicit-any */
import { after, NextResponse } from "next/server";
import { ringCallOnPhones } from "@/lib/mobile-call-push";
import { getClientAccountState } from "@/lib/client-account";
import { closeStaleCmeets } from "@/lib/cmeet-autoclose";
import { agendaItemsToText, normalizeCMeetAgendaItems } from "@/lib/cmeet-agenda";
import { buildCMeetPath, normalizeCMeetTopic } from "@/lib/cmeet-links";
import { supabaseAdmin } from "@/lib/supabase";
import { notifyClientCMeetStarted } from "@/lib/client-cmeet-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADJECTIVES = ["clear", "calm", "bright", "bold", "kind", "swift", "open", "prime"];
const NOUNS = ["room", "river", "cloud", "fox", "lion", "studio", "space", "circle"];

function roomCode() {
  return `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]}-${NOUNS[Math.floor(Math.random() * NOUNS.length)]}-${Math.floor(Math.random() * 89) + 10}`;
}

async function context() {
  if (!supabaseAdmin) return null;
  const account = await getClientAccountState().catch(() => null);
  return account ? { account, db: supabaseAdmin as any } : null;
}

export async function GET() {
  const resolved = await context();
  if (!resolved) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  await closeStaleCmeets();
  const { data, error } = await resolved.db
    .from("team_meetings")
    .select("id, room_code, title, audio_only, scheduled_for, started_at, ended_at, status, created_at")
    .eq("created_by_client", resolved.account.user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    meetings: (data || []).map((meeting: any) => ({ ...meeting, link: buildCMeetPath(meeting.room_code, meeting.title) })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const resolved = await context();
  if (!resolved) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = normalizeCMeetTopic(body.title);
  if (!title) return NextResponse.json({ ok: false, error: "Meeting topic is required." }, { status: 400 });

  let scheduledFor: string | null = null;
  if (body.scheduled_for) {
    const when = new Date(String(body.scheduled_for));
    if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Scheduled meetings require a future date and time." }, { status: 400 });
    }
    scheduledFor = when.toISOString();
  }

  const agenda = normalizeCMeetAgendaItems(body.agenda_items ?? body.agenda);
  let code = roomCode();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: exists } = await resolved.db.from("team_meetings").select("id").eq("room_code", code).maybeSingle();
    if (!exists) break;
    code = roomCode();
  }
  const now = new Date().toISOString();
  const { data: meeting, error } = await resolved.db.from("team_meetings").insert({
    room_code: code,
    title,
    agenda: agenda.length ? agendaItemsToText(agenda) : null,
    audio_only: Boolean(body.audio_only),
    scheduled_for: scheduledFor,
    created_by: null,
    created_by_admin: false,
    created_by_client: resolved.account.user.id,
    guest_email: resolved.account.profile.email || resolved.account.user.email || null,
    status: scheduledFor ? "scheduled" : "live",
    started_at: scheduledFor ? null : now,
    approval_status: "approved",
    approval_requested_at: null,
    approved_at: now,
    approved_by_email: resolved.account.profile.email || resolved.account.user.email || null,
  }).select("id, room_code, title, audio_only, scheduled_for, started_at, status, created_at").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (agenda.length) {
    const { error: agendaError } = await resolved.db.from("team_meeting_agenda_items").insert(
      agenda.map((agendaTitle, position) => ({ meeting_id: meeting.id, title: agendaTitle, position })),
    );
    if (agendaError) {
      await resolved.db.from("team_meetings").delete().eq("id", meeting.id);
      return NextResponse.json({ ok: false, error: "The meeting agenda could not be saved." }, { status: 500 });
    }
  }

  if (!scheduledFor) {
    const { error: invitationError } = await resolved.db
      .from("cmeet_staff_invitations")
      .insert({ meeting_id: meeting.id });
    if (invitationError) {
      await resolved.db.from("team_meetings").delete().eq("id", meeting.id);
      return NextResponse.json({ ok: false, error: "The admin call invitation could not be created." }, { status: 500 });
    }

    const clientName = resolved.account.profile.full_name
      || resolved.account.profile.company_name
      || resolved.account.profile.email
      || resolved.account.user.email
      || "A CDS Space client";
    const clientEmail = resolved.account.profile.email || resolved.account.user.email || null;
    after(() => ringCallOnPhones(meeting.id));
    after(async () => {
      await notifyClientCMeetStarted({
        roomCode: meeting.room_code,
        title: meeting.title,
        audioOnly: meeting.audio_only,
        clientName,
        clientEmail,
      });
    });
  }

  return NextResponse.json({
    ok: true,
    requires_approval: false,
    meeting: { ...meeting, link: buildCMeetPath(meeting.room_code, meeting.title) },
  });
}
