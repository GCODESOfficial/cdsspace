 
import { after, NextResponse } from "next/server";
import { ringCallOnPhones } from "@/lib/mobile-call-push";
import { getClientChatContext, getClientProjectThread } from "@/lib/client-project-chat";
import { TEAM_CHAT_MESSAGE_COLUMNS, hydrateTeamMessages } from "@/lib/team-chat-server";
import { buildCMeetPath, normalizeCMeetTopic } from "@/lib/cmeet-links";
import { absolutePublicUrl } from "@/lib/public-site";
import { agendaItemsToText, normalizeCMeetAgendaItems } from "@/lib/cmeet-agenda";
import { notifyClientCMeetStarted } from "@/lib/client-cmeet-notifications";

export const runtime = "nodejs";

const ADJECTIVES = ["quick", "calm", "bright", "bold", "warm", "kind", "clear", "swift"];
const NOUNS = ["river", "cloud", "star", "fox", "lion", "eagle", "studio", "space"];

function callCode() {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective}-${noun}-${Math.floor(Math.random() * 89) + 10}`;
}

export async function POST(req: Request) {
  const context = await getClientChatContext();
  if (!context) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const payload = await req.json().catch(() => ({}));
  const kind = payload.kind === "voice" ? "voice" : payload.kind === "video" ? "video" : null;
  const targetKind = payload.targetKind === "project" ? "project" : payload.targetKind === "direct" ? "direct" : null;
  const targetId = String(payload.targetId || "");
  if (!kind || !targetKind || !targetId) {
    return NextResponse.json({ ok: false, error: "Call kind and conversation are required" }, { status: 400 });
  }

  // A client can now set a meeting up for later from the conversation it
  // belongs to, so the room is reserved rather than opened.
  let scheduledFor: string | null = null;
  if (payload.scheduled_for) {
    const when = new Date(String(payload.scheduled_for));
    if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Scheduled meetings require a future date and time." }, { status: 400 });
    }
    scheduledFor = when.toISOString();
  }
  const requestedTitle = normalizeCMeetTopic(payload.title);
  const agendaItems = normalizeCMeetAgendaItems(payload.agenda_items ?? payload.agenda);

  const { account, db } = context;
  const directRoomId = `client_${account.user.id}`;
  let projectAccess: Awaited<ReturnType<typeof getClientProjectThread>> = null;
  if (targetKind === "direct" && targetId !== directRoomId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (targetKind === "project") {
    projectAccess = await getClientProjectThread(db, account.user.id, targetId);
    if (!projectAccess) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (projectAccess.thread.is_announcement_only) {
      return NextResponse.json({ ok: false, error: "This project channel is read-only." }, { status: 403 });
    }
  }

  let roomCode = callCode();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: existing } = await db.from("team_meetings").select("id").eq("room_code", roomCode).maybeSingle();
    if (!existing) break;
    roomCode = callCode();
  }

  const targetName = targetKind === "project" ? projectAccess?.thread.name || "Project chat" : "Client conversation";
  const now = new Date().toISOString();
  const { data: meeting, error } = await db
    .from("team_meetings")
    .insert({
      room_code: roomCode,
      title: requestedTitle || `${kind === "voice" ? "Voice" : "Video"} call - ${targetName}`,
      agenda: agendaItems.length ? agendaItemsToText(agendaItems) : null,
      audio_only: kind === "voice",
      scheduled_for: scheduledFor,
      project_id: targetKind === "project" ? projectAccess?.thread.project_id : null,
      created_by: null,
      created_by_admin: false,
      created_by_client: account.user.id,
      guest_email: account.profile.email || account.user.email || null,
      status: scheduledFor ? "scheduled" : "live",
      started_at: scheduledFor ? null : now,
      approval_status: "approved",
      approval_requested_at: null,
      approved_at: now,
      approved_by_email: account.profile.email || account.user.email || null,
    })
    .select("id, room_code, title, audio_only")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (agendaItems.length) {
    const { error: agendaError } = await db.from("team_meeting_agenda_items").insert(
      agendaItems.map((title, position) => ({ meeting_id: meeting.id, title, position })),
    );
    if (agendaError) {
      await db.from("team_meetings").delete().eq("id", meeting.id);
      return NextResponse.json({ ok: false, error: "The meeting agenda could not be saved." }, { status: 500 });
    }
  }

  // A client calling CDS Space should ring the staff portal immediately. One
  // shared invitation stops ringing for everyone when the first staff member
  // joins, avoiding several admins answering the same call.
  if (!scheduledFor) {
    const { error: invitationError } = await db.from("cmeet_staff_invitations").insert({ meeting_id: meeting.id });
    if (invitationError) {
      await db.from("team_meetings").delete().eq("id", meeting.id);
      return NextResponse.json({ ok: false, error: "The admin call invitation could not be created." }, { status: 500 });
    }
  }

  // Absolute, like team chat posts. A bare path reads fine inside the app but
  // is broken the moment it is copied into an email or another app, and the
  // link preview service cannot fetch one either.
  const link = absolutePublicUrl(buildCMeetPath(meeting.room_code, meeting.title));
  const messageBody = scheduledFor
    ? `${kind === "voice" ? "Audio" : "Video"} cMeet: ${meeting.title}, scheduled for ${new Date(scheduledFor).toUTCString()} - link: ${link}`
    : `${kind === "voice" ? "Audio" : "Video"} cMeet is live: ${meeting.title} - link: ${link}`;

  if (targetKind === "direct") {
    const { error: messageError } = await db.from("chat_messages").insert({
      room_id: directRoomId,
      sender_id: account.user.id,
      sender_role: "client",
      message: messageBody,
      source: "web",
    });
    if (messageError) return NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });

  } else {
    const { data: chatMessage, error: messageError } = await db
      .from("team_chat_messages")
      .insert({
        thread_id: targetId,
        sender_id: null,
        client_user_id: account.user.id,
        sender_is_admin: false,
        body: messageBody,
        message_type: "text",
        delivery_status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select(TEAM_CHAT_MESSAGE_COLUMNS)
      .single();
    if (messageError) return NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });
    await hydrateTeamMessages([chatMessage]);

  }

  if (!scheduledFor) {
    const clientName = account.profile.full_name
      || account.profile.company_name
      || account.profile.email
      || account.user.email
      || "A CDS Space client";
    const clientEmail = account.profile.email || account.user.email || null;
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

  return NextResponse.json({ ok: true, meeting, link, scheduled_for: scheduledFor, requires_approval: false });
}
