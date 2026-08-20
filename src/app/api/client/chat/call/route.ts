/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { ADMIN_FEATURE_PERMISSION_KEYS, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";
import { getClientChatContext, getClientProjectThread } from "@/lib/client-project-chat";
import { TEAM_CHAT_MESSAGE_COLUMNS, hydrateTeamMessages } from "@/lib/team-chat-server";

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
  const { data: meeting, error } = await db
    .from("team_meetings")
    .insert({
      room_code: roomCode,
      title: `${kind === "voice" ? "Voice" : "Video"} call - ${targetName}`,
      audio_only: kind === "voice",
      project_id: targetKind === "project" ? projectAccess?.thread.project_id : null,
      created_by: null,
      created_by_admin: false,
      status: "live",
      started_at: new Date().toISOString(),
    })
    .select("id, room_code, title, audio_only")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const link = `/meet/${meeting.room_code}`;
  const messageBody = `${kind === "voice" ? "📞 Voice" : "🎥 Video"} call started - join: ${link}`;

  if (targetKind === "direct") {
    const { error: messageError } = await db.from("chat_messages").insert({
      room_id: directRoomId,
      sender_id: account.user.id,
      sender_role: "client",
      message: messageBody,
      source: "web",
    });
    if (messageError) return NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });

    const senderName = account.profile.full_name || account.profile.company_name || account.profile.email || "Client";
    await notifyAdminFeatureEvent({
      permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.messages,
      title: `${kind === "voice" ? "Audio" : "Video"} call from ${senderName}`,
      body: `${senderName} started a ${kind} call in Client Chat/Meet.`,
      link: `/admin/messages?room=${encodeURIComponent(directRoomId)}`,
      eyebrow: "Chat/Meet · Client call",
      details: { Client: senderName, Call: kind === "voice" ? "Audio" : "Video" },
    });
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

    const senderName = account.profile.full_name || account.profile.company_name || account.profile.email || "Client";
    const { data: participants } = await db
      .from("team_chat_participants")
      .select("team_member_id")
      .eq("thread_id", targetId);
    const notifications = (participants || []).map((participant: any) => ({
      recipient_id: participant.team_member_id,
      kind: "cmeet_invite",
      title: `${senderName} started a ${kind === "voice" ? "voice" : "video"} call`,
      body: projectAccess?.thread.name || "Project chat",
      link,
      thread_id: targetId,
      meeting_id: meeting.id,
      actor_member_id: null,
      actor_is_admin: false,
    }));
    if (notifications.length) await db.from("team_notifications").insert(notifications);
  }

  return NextResponse.json({ ok: true, meeting, link });
}
