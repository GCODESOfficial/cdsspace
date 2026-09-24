import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { getClientChatAdminActor } from "@/lib/client-chat-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { dealTagsForEmails, type DealClientTag } from "@/lib/deal-client-tags";
import { glashQuery } from "@/lib/glashdb/postgres";

export const dynamic = "force-dynamic";

type RoomRow = {
  roomId: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  source: string;
  client?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    brand_name?: string | null;
    birthday?: string | null;
    manual_client_id?: string | null;
  } | null;
  whatsapp?: { phone: string; display_name: string | null; wa_name: string | null; linked_client_id: string | null } | null;
  meta?: { platform: "facebook" | "instagram"; external_user_id: string; display_name: string | null; username: string | null; linked_client_id: string | null } | null;
  /** Admin-only. Never returned on the client branch below. */
  deal?: DealClientTag | null;
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

      // Birthday and CRM identity live in the unified client directory rather
      // than the authentication profile. Keep this enrichment on the admin
      // branch so a client never receives another client's private metadata.
      const profileIds = Array.from(profileMap.keys());
      const profileEmails = Array.from(profileMap.values())
        .map((profile) => String(profile.email || "").trim().toLowerCase())
        .filter(Boolean);
      let crmByProfile = new Map<string, { id: string; brand_name: string | null; birthday: string | null }>();
      let crmByEmail = new Map<string, { id: string; brand_name: string | null; birthday: string | null }>();
      try {
        const crmClients = await glashQuery<{
          id: string;
          platform_user_id: string | null;
          email: string | null;
          brand_name: string | null;
          birthday: string | null;
        }>(
          `select id, platform_user_id, email, brand_name, birthday
             from public.clients
            where (cardinality($1::uuid[]) > 0 and platform_user_id = any($1::uuid[]))
               or (cardinality($2::text[]) > 0 and lower(trim(coalesce(email, ''))) = any($2::text[]))`,
          [profileIds, profileEmails],
        );
        crmByProfile = new Map(crmClients.filter((client) => client.platform_user_id).map((client) => [client.platform_user_id!, client]));
        crmByEmail = new Map(crmClients.filter((client) => client.email).map((client) => [client.email!.trim().toLowerCase(), client]));
      } catch {
        // CRM enrichment is helpful context, but it must never take the inbox
        // down if the directory is temporarily unavailable.
      }

      const enrichedProfile = (profile: ClientProfileLite | null | undefined) => {
        if (!profile) return null;
        const crm = crmByProfile.get(profile.id) || crmByEmail.get(String(profile.email || "").trim().toLowerCase());
        return {
          ...profile,
          brand_name: crm?.brand_name || null,
          birthday: crm?.birthday ? String(crm.birthday).slice(0, 10) : null,
          manual_client_id: crm?.id || null,
        };
      };

      const hydrated = rooms.map<RoomRow>((room) => {
        if (room.roomId.startsWith("client_")) {
          const id = room.roomId.slice("client_".length);
          return { ...room, client: enrichedProfile(profileMap.get(id)) };
        }
        if (room.roomId.startsWith("whatsapp_")) {
          const phone = room.roomId.slice("whatsapp_".length);
          const c = contactMap.get(phone);
          return {
            ...room,
            whatsapp: c
              ? { phone, display_name: c.display_name, wa_name: c.wa_name, linked_client_id: c.client_id }
              : { phone, display_name: null, wa_name: null, linked_client_id: null },
            client: c?.client_id ? enrichedProfile(profileMap.get(c.client_id)) : null,
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
            client: c?.client_id ? enrichedProfile(profileMap.get(c.client_id)) : null,
          };
        }
        return room;
      });

      // The Deals workspace and this inbox meet on the client's email, so a
      // conversation carries what stage that person's deal is at. Admin branch
      // only: the client branch below never sees a tag. A failure here is not
      // worth losing the inbox over, so the tag simply goes missing.
      let tagged = hydrated;
      try {
        const tags = await dealTagsForEmails(hydrated.map((room) => room.client?.email));
        if (tags.size) {
          tagged = hydrated.map((room) => {
            const tag = room.client?.email ? tags.get(room.client.email.trim().toLowerCase()) : undefined;
            return tag ? { ...room, deal: tag } : room;
          });
        }
      } catch {
        tagged = hydrated;
      }

      tagged.sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      );

      return NextResponse.json({ rooms: tagged });
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
