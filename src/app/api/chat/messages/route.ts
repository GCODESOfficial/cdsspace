import { NextResponse } from "next/server";
import { deliverClientNotificationById } from "@/lib/notification-delivery";
import { verifyUser } from "@/lib/admin-auth";
import { getClientChatAdminActor } from "@/lib/client-chat-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveWhatsAppIntegration, phoneFromWaRoomId } from "@/lib/whatsapp/config";
import { sendCloudApiMessage } from "@/lib/whatsapp/cloud";
import { isQrConnected, sendQrMessage } from "@/lib/whatsapp/qr-runtime";
import { externalIdFromRoomId, getMetaIntegration } from "@/lib/meta/config";
import { graphPost } from "@/lib/meta/graph";
import { isLegacyClientUuid } from "@/lib/client-routes";
import { ADMIN_FEATURE_PERMISSION_KEYS, notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";
import { queueAdminAlert } from "@/lib/admin-alerts";
import { resolveChatSticker } from "@/lib/chat-sticker-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await getClientChatAdminActor("messages.view");
    const userSession = await verifyUser();

    if (!admin && !userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const before = searchParams.get("before");

    if (!roomId) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    if (!admin && userSession) {
      const expectedRoomId = `client_${userSession.user.id}`;
      if (roomId !== expectedRoomId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Newest `limit` messages (older ones page in with `before`), returned
    // oldest-first as before. Sorting ascending with a limit returned the
    // oldest messages, so a long conversation never showed its latest replies.
    let query = supabaseAdmin
      .from("chat_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) query = query.lt("created_at", before);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: (data || []).reverse() });
  } catch (err) {
    console.error("GET /api/chat/messages error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getClientChatAdminActor("messages.send");
    const userSession = await verifyUser();

    if (!admin && !userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { roomId, message } = body;
    const replyToMessageId = typeof body.replyToMessageId === "string" && body.replyToMessageId
      ? body.replyToMessageId
      : null;

    if (!roomId || !message) {
      return NextResponse.json({ error: "roomId and message are required" }, { status: 400 });
    }

    // A browser can legitimately hold both an admin portal cookie and a client
    // dashboard session. Client surfaces opt into the client identity explicitly;
    // the room ownership check below prevents that hint from widening access.
    const clientActorRequested = body.actor === "client";
    if (clientActorRequested && !userSession) {
      return NextResponse.json({ error: "Client session required" }, { status: 401 });
    }

    const isAdmin = !!admin && !clientActorRequested;
    const senderId = isAdmin
      ? (isLegacyClientUuid(admin.id) ? admin.id : null)
      : userSession!.user.id;
    const senderRole = isAdmin ? "admin" : "client";
    const sticker = await resolveChatSticker(supabaseAdmin, body.stickerKey);
    const fileUrl = sticker?.attachmentUrl || body.fileUrl;

    // External channel rooms can only be replied to by admin.
    const isWaRoom = roomId.startsWith("whatsapp_");
    const metaRoom = externalIdFromRoomId(roomId);
    const isExternalRoom = isWaRoom || !!metaRoom;

    if (isExternalRoom && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isAdmin && !isExternalRoom) {
      const expectedRoomId = `client_${senderId}`;
      if (roomId !== expectedRoomId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (replyToMessageId) {
      const { data: replyTarget } = await supabaseAdmin
        .from("chat_messages")
        .select("id, room_id")
        .eq("id", replyToMessageId)
        .maybeSingle();
      if (!replyTarget || replyTarget.room_id !== roomId) {
        return NextResponse.json({ error: "The message being replied to is not in this conversation." }, { status: 400 });
      }
    }

    const outboundSource = isWaRoom
      ? await resolveWaSource()
      : metaRoom
        ? metaRoom.platform
        : "web";

    const { data: chatMessage, error: insertError } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        room_id: roomId,
        sender_id: senderId,
        sender_role: senderRole,
        message,
        file_url: fileUrl || null,
        sticker_key: sticker?.stickerKey || null,
        message_type: sticker ? "sticker" : (typeof body.messageType === "string" ? body.messageType : fileUrl ? "file" : "text"),
        mime_type: sticker?.mimeType || (typeof body.mimeType === "string" ? body.mimeType : null),
        metadata: sticker?.metadata || {},
        reply_to_message_id: replyToMessageId,
        source: outboundSource,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Ship to the right channel.
    if (isWaRoom && isAdmin) {
      const phone = phoneFromWaRoomId(roomId);
      const integ = await getActiveWhatsAppIntegration();
      if (!phone || !integ) {
        return NextResponse.json(
          { error: "WhatsApp is not active. Enable a mode in /admin/integrations/whatsapp." },
          { status: 409 },
        );
      }

      if (integ.mode === "cloud_api") {
        const result = await sendCloudApiMessage(integ, phone, message);
        if (!result.ok) {
          return NextResponse.json({ error: `WhatsApp send failed: ${result.error}` }, { status: 502 });
        }
        await supabaseAdmin
          .from("chat_messages")
          .update({ external_id: result.externalId })
          .eq("id", chatMessage.id);
      } else {
        // web_qr: if the in-process client is connected, send directly; otherwise
        // hand off to the standalone bridge process via the outbox table.
        if (isQrConnected()) {
          try {
            const externalId = await sendQrMessage(phone, message);
            if (externalId) {
              await supabaseAdmin
                .from("chat_messages")
                .update({ external_id: externalId })
                .eq("id", chatMessage.id);
            }
          } catch (err) {
            return NextResponse.json(
              { error: `WhatsApp send failed: ${err instanceof Error ? err.message : String(err)}` },
              { status: 502 },
            );
          }
        } else {
          await supabaseAdmin.from("whatsapp_outbox").insert({
            to_phone: phone,
            body: message,
            chat_message_id: chatMessage.id,
          });
        }
      }
    } else if (metaRoom && isAdmin) {
      const integ = await getMetaIntegration(metaRoom.platform);
      if (!integ?.page_access_token || !integ.page_id) {
        return NextResponse.json(
          { error: `${metaRoom.platform} integration is not configured.` },
          { status: 409 },
        );
      }
      try {
        const sender =
          metaRoom.platform === "instagram" && integ.ig_business_id
            ? integ.ig_business_id
            : integ.page_id;
        const res = await graphPost<{ message_id?: string }>(`/${sender}/messages`, integ.page_access_token, {
          recipient: { id: metaRoom.id },
          messaging_type: "RESPONSE",
          message: { text: message },
        });
        if (res.message_id) {
          await supabaseAdmin
            .from("chat_messages")
            .update({ external_id: res.message_id })
            .eq("id", chatMessage.id);
        }
      } catch (err) {
        return NextResponse.json(
          { error: `${metaRoom.platform} send failed: ${err instanceof Error ? err.message : String(err)}` },
          { status: 502 },
        );
      }
    } else if (isAdmin) {
      // Internal: notify client
      const clientUserId = roomId.slice("client_".length);
      if (isLegacyClientUuid(clientUserId)) {
        const { data: raisedNotice, error: notificationError } = await supabaseAdmin.from("notifications").insert({
          user_id: clientUserId,
          type: "new_message",
          title: "New message from admin",
          message: message.length > 100 ? message.substring(0, 100) + "..." : message,
          link: "/dashboard/messages",
        }).select("id").single();
        // Straight out to the device and inbox, rather than waiting for the sweep.
        if (raisedNotice?.id) void deliverClientNotificationById(String(raisedNotice.id));
        if (notificationError) {
          console.error("Client chat notification failed:", notificationError.message);
        }
      }
    } else {
      // Internal: notify admin
      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase() || "ceo@cdsspace.pro";
      const { data: adminProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", adminEmail)
        .maybeSingle();
      if (adminProfile?.id && isLegacyClientUuid(adminProfile.id)) {
        const { data: raisedNotice, error: notificationError } = await supabaseAdmin.from("notifications").insert({
          user_id: adminProfile.id,
          type: "new_message",
          title: "New message from client",
          message: message.length > 100 ? message.substring(0, 100) + "..." : message,
          link: `/chat?room=${roomId}`,
        }).select("id").single();
        if (raisedNotice?.id) void deliverClientNotificationById(String(raisedNotice.id));
        if (notificationError) {
          console.error("Admin chat notification failed:", notificationError.message);
        }
      }
      const senderName = String(userSession?.user.user_metadata?.full_name || userSession?.user.email || "A client");
      await notifyAdminFeatureEvent({
        permissionKeys: ADMIN_FEATURE_PERMISSION_KEYS.messages,
        title: `New client message from ${senderName}`,
        body: message.length > 180 ? `${message.slice(0, 180)}…` : message,
        link: `/admin/messages?room=${encodeURIComponent(roomId)}`,
        eyebrow: "Sales Hub · Chat/Meet",
        details: { Client: senderName, Channel: outboundSource === "web" ? "Client dashboard" : outboundSource },
      });

      // A client waiting on a reply cannot wait for the digest cycle, so the
      // desk is emailed straight away as well.
      queueAdminAlert({
        kind: "client_message",
        subject: senderName,
        details: [
          ["Client", senderName],
          ["Email", userSession?.user.email],
          ["Channel", outboundSource === "web" ? "Client dashboard" : outboundSource],
          ["Attachment", fileUrl ? "Yes" : null],
        ],
        body: message,
        actionPath: `/admin/messages?room=${encodeURIComponent(roomId)}`,
        actionLabel: "Open the conversation",
        ...(userSession?.user.email ? { replyTo: userSession.user.email } : {}),
      });
    }

    return NextResponse.json({ message: chatMessage });
  } catch (err) {
    console.error("POST /api/chat/messages error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function resolveWaSource(): Promise<"whatsapp_cloud" | "whatsapp_qr"> {
  const integ = await getActiveWhatsAppIntegration();
  return integ?.mode === "cloud_api" ? "whatsapp_cloud" : "whatsapp_qr";
}
