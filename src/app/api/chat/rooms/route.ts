import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { getClientChatAdminActor } from "@/lib/client-chat-admin";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RoomRow = {
  roomId: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  source: string;
  client?: { id: string; email: string; full_name: string | null; avatar_url: string | null } | null;
  whatsapp?: { phone: string; display_name: string | null; wa_name: string | null; linked_client_id: string | null } | null;
  meta?: { platform: "facebook" | "instagram"; external_user_id: string; display_name: string | null; username: string | null; linked_client_id: string | null } | null;
};

type ClientProfileLite = NonNullable<RoomRow["client"]>;
type WhatsAppContactLite = {
  phone: string;
  display_name: string | null;
  wa_name: string | null;
  client_id: string | null;
};
type MetaContactLite = {
  platform: "facebook" | "instagram";
  external_user_id: string;
  display_name: string | null;
  username: string | null;
  client_id: string | null;
};

export async function GET() {
  try {
    const admin = await getClientChatAdminActor("messages.view");
    const userSession = await verifyUser();

    if (!admin && !userSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const isAdmin = !!admin;

    if (isAdmin) {
      const { data: messages, error: messagesError } = await supabaseAdmin
        .from("chat_messages")
        .select("room_id, message, created_at, sender_role, is_read, source")
        .order("created_at", { ascending: false });

      if (messagesError) {
        return NextResponse.json({ error: messagesError.message }, { status: 500 });
      }

      const roomMap = new Map<string, RoomRow>();
      for (const msg of messages || []) {
        if (!roomMap.has(msg.room_id)) {
          roomMap.set(msg.room_id, {
            roomId: msg.room_id,
            lastMessage: msg.message,
            lastMessageAt: msg.created_at,
            unreadCount: 0,
            source: msg.source || "web",
          });
        }
        if (msg.sender_role === "client" && !msg.is_read) {
          roomMap.get(msg.room_id)!.unreadCount += 1;
        }
      }

      const rooms = Array.from(roomMap.values());

      // Split by room prefix.
      const clientIds = rooms
        .filter((r) => r.roomId.startsWith("client_"))
        .map((r) => r.roomId.slice("client_".length));
      const waPhones = rooms
        .filter((r) => r.roomId.startsWith("whatsapp_"))
        .map((r) => r.roomId.slice("whatsapp_".length));
      const fbIds = rooms
        .filter((r) => r.roomId.startsWith("facebook_"))
        .map((r) => r.roomId.slice("facebook_".length));
      const igIds = rooms
        .filter((r) => r.roomId.startsWith("instagram_"))
        .map((r) => r.roomId.slice("instagram_".length));

      const metaExternalIds = [...fbIds, ...igIds];

      const [{ data: profiles }, { data: waContacts }, { data: metaContacts }] = await Promise.all([
        clientIds.length
          ? supabaseAdmin.from("profiles").select("id, email, full_name, avatar_url").in("id", clientIds)
          : Promise.resolve({ data: [] as { id: string; email: string; full_name: string | null; avatar_url: string | null }[] }),
        waPhones.length
          ? supabaseAdmin.from("whatsapp_contacts").select("phone, display_name, wa_name, client_id").in("phone", waPhones)
          : Promise.resolve({ data: [] as { phone: string; display_name: string | null; wa_name: string | null; client_id: string | null }[] }),
        metaExternalIds.length
          ? supabaseAdmin
              .from("meta_contacts")
              .select("platform, external_user_id, display_name, username, client_id")
              .in("external_user_id", metaExternalIds)
          : Promise.resolve({
              data: [] as { platform: "facebook" | "instagram"; external_user_id: string; display_name: string | null; username: string | null; client_id: string | null }[],
            }),
      ]);

      const profileRows = (profiles || []) as ClientProfileLite[];
      const whatsAppRows = (waContacts || []) as WhatsAppContactLite[];
      const metaRows = (metaContacts || []) as MetaContactLite[];
      const profileMap = new Map<string, ClientProfileLite>(profileRows.map((profile) => [profile.id, profile]));
      const contactMap = new Map<string, WhatsAppContactLite>(whatsAppRows.map((contact) => [contact.phone, contact]));
      const metaContactMap = new Map(
        metaRows.map((contact) => [`${contact.platform}_${contact.external_user_id}`, contact] as const),
      );

      const linkedClientIds = [
        ...Array.from(contactMap.values()).map((contact) => contact.client_id),
        ...Array.from(metaContactMap.values()).map((contact) => contact.client_id),
      ].filter((x): x is string => !!x && !profileMap.has(x));

      if (linkedClientIds.length) {
        const { data: extraProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, avatar_url")
          .in("id", linkedClientIds);
        ((extraProfiles || []) as ClientProfileLite[]).forEach((profile) => profileMap.set(profile.id, profile));
      }

      const hydrated = rooms.map<RoomRow>((room) => {
        if (room.roomId.startsWith("client_")) {
          const id = room.roomId.slice("client_".length);
          return { ...room, client: profileMap.get(id) || null };
        }
        if (room.roomId.startsWith("whatsapp_")) {
          const phone = room.roomId.slice("whatsapp_".length);
          const c = contactMap.get(phone);
          return {
            ...room,
            whatsapp: c
              ? { phone, display_name: c.display_name, wa_name: c.wa_name, linked_client_id: c.client_id }
              : { phone, display_name: null, wa_name: null, linked_client_id: null },
            client: c?.client_id ? profileMap.get(c.client_id) || null : null,
          };
        }
        if (room.roomId.startsWith("facebook_") || room.roomId.startsWith("instagram_")) {
          const platform = room.roomId.startsWith("facebook_") ? "facebook" : "instagram";
          const externalId = room.roomId.slice((platform + "_").length);
          const c = metaContactMap.get(`${platform}_${externalId}`);
          return {
            ...room,
            meta: {
              platform,
              external_user_id: externalId,
              display_name: c?.display_name ?? null,
              username: c?.username ?? null,
              linked_client_id: c?.client_id ?? null,
            },
            client: c?.client_id ? profileMap.get(c.client_id) || null : null,
          };
        }
        return room;
      });

      hydrated.sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      );

      return NextResponse.json({ rooms: hydrated });
    }

    // Client: still just their own internal room.
    const userId = userSession!.user.id;
    const roomId = `client_${userId}`;

    const { data: latestMessage, error: msgError } = await supabaseAdmin
      .from("chat_messages")
      .select("message, created_at, source")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    const { count: unreadCount, error: countError } = await supabaseAdmin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("sender_role", "admin")
      .eq("is_read", false);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    return NextResponse.json({
      rooms: [
        {
          roomId,
          lastMessage: latestMessage?.message || null,
          lastMessageAt: latestMessage?.created_at || null,
          unreadCount: unreadCount || 0,
          source: latestMessage?.source || "web",
        },
      ],
    });
  } catch (err) {
    console.error("GET /api/chat/rooms error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
