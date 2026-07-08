/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getChatViewer } from "@/lib/team-chat-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forward a message between the client-admin chat and the team chat.
 *
 * Body shape:
 *   {
 *     source:        "client" | "team",
 *     source_id:     string,           // chat_messages.id or team_chat_messages.id
 *     target:        "client" | "team",
 *     target_id:     string            // client room_id OR team thread_id
 *   }
 *
 * The forwarded message stores the ORIGINAL sender's name + body in its
 * `forwarded` JSONB. We deliberately DO NOT record who forwarded it - only
 * who currently sent it (the admin performing the forward).
 */
export async function POST(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Only admins can cross the client/team boundary. Team members can still
  // forward within team chat.
  const db = supabaseAdmin as any;
  const { source, source_id, target, target_id } = await req.json().catch(() => ({}));
  if (!source || !source_id || !target || !target_id) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }
  if (source !== "client" && source !== "team") {
    return NextResponse.json({ ok: false, error: "Invalid source" }, { status: 400 });
  }
  if (target !== "client" && target !== "team") {
    return NextResponse.json({ ok: false, error: "Invalid target" }, { status: 400 });
  }
  if (source !== target && viewer.kind !== "admin") {
    return NextResponse.json({ ok: false, error: "Only admins can forward between client and team chat" }, { status: 403 });
  }

  // 1. Fetch the source message + resolve original sender display name
  let originalSenderName = "Unknown";
  let originalBody = "";
  let originalCreatedAt: string | null = null;
  let originalAttachment: string | null = null;

  if (source === "client") {
    const { data: m, error } = await db
      .from("chat_messages")
      .select("id, sender_id, sender_role, message, file_url, created_at")
      .eq("id", source_id)
      .maybeSingle();
    if (error || !m) return NextResponse.json({ ok: false, error: "Source message not found" }, { status: 404 });
    originalBody = m.message || "";
    originalCreatedAt = m.created_at;
    originalAttachment = m.file_url || null;
    if (m.sender_role === "admin") {
      originalSenderName = "Admin";
    } else {
      const { data: p } = await db.from("profiles").select("full_name, email").eq("id", m.sender_id).maybeSingle();
      originalSenderName = p?.full_name || p?.email || "Client";
    }
  } else {
    const { data: m, error } = await db
      .from("team_chat_messages")
      .select("id, sender_id, sender_is_admin, body, attachment_url, created_at")
      .eq("id", source_id)
      .maybeSingle();
    if (error || !m) return NextResponse.json({ ok: false, error: "Source message not found" }, { status: 404 });
    originalBody = m.body || "";
    originalCreatedAt = m.created_at;
    originalAttachment = m.attachment_url || null;
    if (m.sender_is_admin) {
      originalSenderName = "Admin";
    } else if (m.sender_id) {
      const { data: tm } = await db.from("team_members").select("full_name").eq("id", m.sender_id).maybeSingle();
      originalSenderName = tm?.full_name || "Team member";
    }
  }

  const forwardedMeta = {
    original_sender_name: originalSenderName,
    original_body: originalBody,
    original_created_at: originalCreatedAt,
    original_source: source,
  };

  // 2. Insert into the target
  if (target === "team") {
    // Ensure the viewer can actually post into this thread (team members: participant check)
    if (viewer.kind === "team") {
      const { data: thread } = await db.from("team_chat_threads").select("kind").eq("id", target_id).maybeSingle();
      if (!thread) return NextResponse.json({ ok: false, error: "Target thread not found" }, { status: 404 });
      if (thread.kind !== "department" && thread.kind !== "admin_broadcast") {
        const { data: part } = await db
          .from("team_chat_participants")
          .select("thread_id")
          .eq("thread_id", target_id)
          .eq("team_member_id", viewer.session.id)
          .maybeSingle();
        if (!part) return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
      }
    }
    const { data: inserted, error: insErr } = await db
      .from("team_chat_messages")
      .insert({
        thread_id: target_id,
        sender_id: viewer.kind === "team" ? viewer.session.id : null,
        sender_is_admin: viewer.kind === "admin",
        body: originalBody,
        attachment_url: originalAttachment,
        forwarded: forwardedMeta,
      })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, message_id: inserted.id });
  }

  // target === "client"
  // Only admin can forward INTO a client room
  if (viewer.kind !== "admin") {
    return NextResponse.json({ ok: false, error: "Only admin can forward to client chat" }, { status: 403 });
  }
  // target_id must look like a client room id "client_{uuid}"
  if (!/^client_/.test(String(target_id))) {
    return NextResponse.json({ ok: false, error: "Invalid client room id" }, { status: 400 });
  }
  // Use a deterministic "forwarded" sender_id so RLS / listing still works.
  // We pick the super-admin's profile id if one exists; otherwise null.
  const { data: adminProfile } = await db.from("profiles").select("id").eq("email", "ceo@cdsspace.pro").maybeSingle();

  const { data: inserted, error: insErr } = await db
    .from("chat_messages")
    .insert({
      room_id: target_id,
      sender_id: adminProfile?.id || null,
      sender_role: "admin",
      message: originalBody,
      file_url: originalAttachment,
      forwarded: forwardedMeta,
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, message_id: inserted.id });
}
