/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getChatViewer, viewerIsSuperAdmin, viewerMemberId } from "@/lib/team-chat-auth";
import {
  canViewTeamThread,
  getTeamChatDb,
  getViewerPayload,
  hydrateTeamMessages,
  isAttachmentRestrictedThread,
  TEAM_CHAT_MESSAGE_COLUMNS,
} from "@/lib/team-chat-server";
import { canShareProtectedChatResource } from "@/lib/chat-resource-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { sendPushToActor } from "@/lib/web-push-server";
import { sendOrHoldNotificationEmail } from "@/lib/notification-email-batching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(req: Request) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200);
  // `since`  -> incremental delta sync: only rows changed after this cursor.
  // `before` -> history pagination: an older page ending before this timestamp.
  const since = searchParams.get("since");
  const before = searchParams.get("before");
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });

  if (!(await canViewTeamThread(viewer, threadId))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Column list with the change-tracking column appended. If the realtime
  // migration (glashdb-chat-realtime.sql) hasn't been applied, selecting/
  // filtering `updated_at` errors and we transparently fall back to created_at
  // (new-messages-only sync) so chat never breaks.
  const DELTA_COLUMNS = `${TEAM_CHAT_MESSAGE_COLUMNS}, updated_at`;

  let rows: any[] = [];
  let usedUpdatedAt = true;

  if (since) {
    // Delta: everything touched since the cursor. `updated_at > since` catches
    // new messages AND mutations (edits/deletes/reactions/pins) in one filter,
    // because the trigger bumps updated_at on every write.
    let res = await db
      .from("team_chat_messages")
      .select(DELTA_COLUMNS)
      .eq("thread_id", threadId)
      .gt("updated_at", since)
      .order("updated_at", { ascending: true })
      .limit(500);
    if (res.error) {
      usedUpdatedAt = false;
      res = await db
        .from("team_chat_messages")
        .select(TEAM_CHAT_MESSAGE_COLUMNS)
        .eq("thread_id", threadId)
        .gt("created_at", since)
        .order("created_at", { ascending: true })
        .limit(500);
    }
    if (res.error) return NextResponse.json({ ok: false, error: res.error.message }, { status: 500 });
    rows = (res.data || []) as any[];
  } else {
    // Initial load or older-history page: newest `limit` rows (descending),
    // then reversed to ascending for display. `before` pages further back.
    let query = db
      .from("team_chat_messages")
      .select(DELTA_COLUMNS)
      .eq("thread_id", threadId);
    if (before) query = query.lt("created_at", before);
    let res = await query.order("created_at", { ascending: false }).limit(limit);
    if (res.error) {
      usedUpdatedAt = false;
      let fallback = db
        .from("team_chat_messages")
        .select(TEAM_CHAT_MESSAGE_COLUMNS)
        .eq("thread_id", threadId);
      if (before) fallback = fallback.lt("created_at", before);
      res = await fallback.order("created_at", { ascending: false }).limit(limit);
    }
    if (res.error) return NextResponse.json({ ok: false, error: res.error.message }, { status: 500 });
    rows = ((res.data || []) as any[]).slice().reverse();
  }

  // Advance the sync cursor to the newest change we're returning. Prefer
  // updated_at (when available); fall back to created_at.
  const cursorField = usedUpdatedAt ? "updated_at" : "created_at";
  let cursorMs = since ? Date.parse(since) : 0;
  for (const row of rows) {
    const t = Date.parse(row[cursorField] || row.created_at);
    if (Number.isFinite(t) && t > cursorMs) cursorMs = t;
  }
  const cursor = cursorMs > 0 ? new Date(cursorMs).toISOString() : new Date().toISOString();

  // Only a full page implies there may be older history to page through.
  const hasMore = !since && rows.length >= limit;

  const enriched = await hydrateTeamMessages(rows);

  // Live presence signals for typing indicators and read ticks. Derived from the
  // participant rows the client already writes (last_typing_at via the typing
  // route, last_read_at via the read route) - no schema change needed. Skipped on
  // history pagination (`before`) where it isn't relevant.
  let typing: { id: string; name: string }[] = [];
  let readWatermark: string | null = null;
  if (!before) {
    const selfId = viewerMemberId(viewer);
    const { data: parts } = await db
      .from("team_chat_participants")
      .select("team_member_id, last_read_at, last_typing_at")
      .eq("thread_id", threadId);
    const others = ((parts || []) as any[]).filter((p) => p.team_member_id && p.team_member_id !== selfId);
    const now = Date.now();
    const typingIds: string[] = [];
    for (const p of others) {
      if (p.last_typing_at && now - new Date(p.last_typing_at).getTime() < 6000) typingIds.push(p.team_member_id);
      if (p.last_read_at) {
        const t = new Date(p.last_read_at).getTime();
        if (!readWatermark || t > new Date(readWatermark).getTime()) readWatermark = new Date(p.last_read_at).toISOString();
      }
    }
    if (typingIds.length) {
      const { data: members } = await db.from("team_members").select("id, full_name").in("id", typingIds);
      typing = ((members || []) as any[]).map((m) => ({ id: m.id, name: m.full_name || "Someone" }));
    }
  }

  return NextResponse.json({
    ok: true,
    messages: enriched,
    cursor,
    hasMore,
    typing,
    read_watermark: readWatermark,
    viewer: getViewerPayload(viewer),
  });
}

export async function POST(req: Request) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const {
    threadId,
    body,
    attachmentUrl,
    replyToMessageId,
    stickerKey,
    messageType,
    scheduledFor,
    metadata,
    fileName,
    fileSizeBytes,
    mimeType,
  } = await req.json().catch(() => ({}));
  if (!threadId || !(body?.trim() || attachmentUrl || stickerKey)) {
    return NextResponse.json(
      { ok: false, error: "threadId and a message body, sticker, or attachment are required" },
      { status: 400 },
    );
  }
  if (!(await canViewTeamThread(viewer, threadId))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Gate sharing of protected resources (project/document/invoice) - only
  // applies when the outbound message carries a resource payload in metadata.
  const protectedShare = await canShareProtectedChatResource(viewer, threadId, metadata);
  if (!protectedShare.ok) {
    return NextResponse.json({ ok: false, error: protectedShare.error }, { status: 403 });
  }

  // Direct member chats accept inline photos. Other attachments remain in
  // managed group spaces; admin DMs and group threads allow every valid type.
  const carriesAttachment = !!attachmentUrl || (typeof messageType === "string" && ["file", "image", "video", "audio"].includes(messageType));
  const isInlinePhoto =
    !!attachmentUrl &&
    (messageType === "image" ||
      messageType === "sticker" ||
      /^\[\[image:[^\]]+\]\]$/.test(String(body || "")));
  if (carriesAttachment && !isInlinePhoto && (await isAttachmentRestrictedThread(threadId))) {
    return NextResponse.json(
      { ok: false, error: "Documents and videos belong in a department or project group chat. Photos can be pasted directly into this chat." },
      { status: 403 },
    );
  }

  // Announcement channels are post-restricted: only management (admins +
  // sub-admins) may post; regular members can read, react and acknowledge.
  const { data: threadMeta } = await db
    .from("team_chat_threads")
    .select("is_announcement_only")
    .eq("id", threadId)
    .maybeSingle();
  if (threadMeta?.is_announcement_only) {
    const isManagement = viewer.kind === "admin" || (viewer.kind === "team" && viewer.session.is_sub_admin);
    if (!isManagement) {
      return NextResponse.json(
        { ok: false, error: "Only management can post in this announcement channel." },
        { status: 403 },
      );
    }
  }

  if (replyToMessageId) {
    const { data: replyMessage } = await db
      .from("team_chat_messages")
      .select("id, thread_id")
      .eq("id", replyToMessageId)
      .maybeSingle();
    if (!replyMessage || replyMessage.thread_id !== threadId) {
      return NextResponse.json({ ok: false, error: "Reply target not found" }, { status: 404 });
    }
  }

  const { data: msg, error } = await db
    .from("team_chat_messages")
    .insert({
      thread_id: threadId,
      sender_id: viewerMemberId(viewer),
      sender_is_admin: viewerIsSuperAdmin(viewer),
      body: body?.trim() || null,
      attachment_url: attachmentUrl || null,
      reply_to_message_id: replyToMessageId || null,
      sticker_key: stickerKey || null,
      message_type: messageType || (stickerKey ? "sticker" : attachmentUrl ? "file" : "text"),
      delivery_status: scheduledFor ? "scheduled" : "sent",
      scheduled_for: scheduledFor || null,
      sent_at: scheduledFor ? null : new Date().toISOString(),
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      file_name: fileName || null,
      file_size_bytes: Number.isFinite(Number(fileSizeBytes)) ? Number(fileSizeBytes) : null,
      mime_type: mimeType || null,
    })
    .select(TEAM_CHAT_MESSAGE_COLUMNS)
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Notify other participants. Title now leads with the sender's name so
  // the bell groups visually by who-said-what-where, e.g.:
  //   "Ada · #Family House"
  //   body: "hey I was thinking we should..."
  const { data: parts } = await db
    .from("team_chat_participants")
    .select("team_member_id")
    .eq("thread_id", threadId);
  const { data: thread } = await db
    .from("team_chat_threads")
    .select("name, kind")
    .eq("id", threadId)
    .maybeSingle();
  const threadLabel = thread?.name || (thread?.kind === "direct" ? "Direct message" : "Team chat");

  const senderName =
    viewer.kind === "admin"
      ? (viewer.name || "Super admin")
      : (viewer.session.full_name || "A teammate");
  const senderId = viewerMemberId(viewer);
  const isTaskPost = Boolean(
    metadata && typeof metadata === "object" && metadata.task_post,
  );

  // "@everyone" turns the normal per-message notification into an explicit
  // mention so every participant sees they were tagged.
  const mentionsEveryone = !!body && /(^|[\s(])@everyone\b/i.test(body);

  const notifRows = (parts || [])
    .filter((p: any) => p.team_member_id !== senderId)
    .map((p: any) => ({
      recipient_id: p.team_member_id,
      kind: isTaskPost ? "chat_task_post" : mentionsEveryone ? "chat_mention" : "chat_message",
      title: isTaskPost
        ? `${senderName} assigned a task · ${threadLabel}`
        : mentionsEveryone
        ? `${senderName} mentioned everyone · ${threadLabel}`
        : `${senderName} · ${threadLabel}`,
      body: stickerKey ? "Sticker" : body?.slice(0, 120) || "Attachment",
      link: `/team/chat?thread=${threadId}`,
      thread_id: threadId,
      actor_member_id: senderId,
      actor_is_admin: viewerIsSuperAdmin(viewer),
    }));
  if (notifRows.length) await db.from("team_notifications").insert(notifRows);

  const recipients = (parts || []).filter(
    (part: any) => part.team_member_id && part.team_member_id !== senderId,
  );
  if (recipients.length && !scheduledFor) {
    await glashQuery(
      `insert into public.team_chat_message_receipts
         (message_id, thread_id, viewer_key, viewer_kind, team_member_id)
       select $1::uuid, $2::uuid, recipient_id::text, 'team', recipient_id
         from unnest($3::uuid[]) as recipient_id
       on conflict (message_id, viewer_key) do nothing`,
      [msg.id, threadId, recipients.map((part: any) => part.team_member_id)],
    ).catch(() => undefined);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(req.url).origin;
    const chatUrl = `${siteUrl}/team/chat?thread=${encodeURIComponent(threadId)}`;
    const summary = stickerKey ? "Sticker" : body?.trim() || "Shared an attachment";
    const profiles = await glashQuery<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>(
      `select id, full_name, email
         from public.team_members
        where id = any($1::uuid[]) and is_active = true`,
      [recipients.map((part: any) => part.team_member_id)],
    ).catch(() => []);
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    // Delivery must not hold up the sender. Email in particular can take
    // seconds, or stall entirely when the host blocks outbound SMTP, and the
    // message itself is already saved.
    void Promise.allSettled(
      recipients.map(async (part: any) => {
        const profile = profileById.get(part.team_member_id);
        const email = String(profile?.email || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
        const recipientName = profile?.full_name || "Team member";

        // The device notice is always immediate.
        void sendPushToActor("team", part.team_member_id, {
          title: `${senderName} in ${threadLabel}`,
          body: summary,
          url: `/team/chat?thread=${threadId}`,
          tag: `thread-${threadId}`,
        });

        // Ordinary messages are batched into one summary email, so a busy
        // thread cannot fill an inbox. Task posts need acknowledgement, so
        // they still go out on their own, immediately.
        if (!isTaskPost) {
          await sendOrHoldNotificationEmail({
            actorKind: "team",
            actorId: part.team_member_id,
            email,
            name: recipientName,
            title: `${senderName} in ${threadLabel}`,
            body: summary,
            link: `/team/chat?thread=${threadId}`,
            kind: "chat_message",
          });
          return;
        }

        const subject = isTaskPost
          ? `Task post in ${threadLabel}`
          : `New message in ${threadLabel}`;
        await sendEmail({
          to: email,
          subject,
          fromName: "CDS Space",
          threadCategory: isTaskPost ? "team-chat-task" : "team-chat-message",
          text: `${senderName}: ${summary}\n${chatUrl}`,
          html: brandedEmailHtml(
            `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:22px;">${escapeHtml(subject)}</h1>
             <p style="margin:0 0 14px;">Hello ${escapeHtml(recipientName)},</p>
             <p style="margin:0 0 18px;"><strong>${escapeHtml(senderName)}</strong> ${isTaskPost ? "posted a task that requires your acknowledgement" : "sent a message"} in <strong>${escapeHtml(threadLabel)}</strong>.</p>
             <div style="margin:0 0 20px;padding:14px;border:1px solid #E8EDF5;border-radius:12px;background:#F8FAFD;color:#0D1B39;">${escapeHtml(summary)}</div>
             <a href="${escapeHtml(chatUrl)}" style="display:inline-block;border-radius:10px;background:#0A4FE8;padding:12px 20px;color:#FFFFFF;text-decoration:none;font-weight:700;">Open team chat</a>`,
            { eyebrow: isTaskPost ? "Task post" : "Team chat", preheader: escapeHtml(summary) },
          ),
        });
      }),
    );
  }

  const [message] = await hydrateTeamMessages([msg]);

  return NextResponse.json({
    ok: true,
    message,
  });
}
