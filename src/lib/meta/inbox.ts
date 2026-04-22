import { getSupabaseAdmin } from "@/lib/supabase";
import { roomIdFor, type MetaPlatform } from "./config";

export interface InboundMetaMessage {
  platform: MetaPlatform;
  externalUserId: string;             // PSID / IGSID
  displayName?: string | null;
  username?: string | null;
  body: string;
  externalId: string;                 // Graph message id
  externalThreadId?: string | null;   // conversation id
  createdAtIso: string;               // message's original timestamp
  fromPage: boolean;                  // true if the page/IG account sent it (outbound mirror)
  mediaUrl?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Idempotent on (source, external_id). Up-serts meta_contacts. Inserts a chat_messages row
 * tagged with source='facebook'|'instagram'; sender_role='admin' if the message originated
 * from the page (outbound mirror) and 'client' otherwise.
 */
export async function ingestMetaMessage(msg: InboundMetaMessage) {
  const supabase = getSupabaseAdmin();
  const source = msg.platform;
  const roomId = roomIdFor(msg.platform, msg.externalUserId);

  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("source", source)
    .eq("external_id", msg.externalId)
    .maybeSingle();
  if (existing?.id) return { inserted: false, id: existing.id };

  if (!msg.fromPage) {
    await supabase.from("meta_contacts").upsert(
      {
        platform: msg.platform,
        external_user_id: msg.externalUserId,
        display_name: msg.displayName ?? null,
        username: msg.username ?? null,
        last_inbound_at: msg.createdAtIso,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,external_user_id" },
    );
  }

  const { data: contact } = await supabase
    .from("meta_contacts")
    .select("client_id")
    .eq("platform", msg.platform)
    .eq("external_user_id", msg.externalUserId)
    .maybeSingle();

  const { data: inserted, error } = await supabase
    .from("chat_messages")
    .insert({
      room_id: roomId,
      sender_id: msg.fromPage ? null : contact?.client_id ?? null,
      sender_role: msg.fromPage ? "admin" : "client",
      message: msg.body || "",
      file_url: msg.mediaUrl ?? null,
      source,
      external_id: msg.externalId,
      external_thread_id: msg.externalThreadId ?? null,
      external_metadata: msg.metadata ?? null,
      created_at: msg.createdAtIso,
      is_read: msg.fromPage ? true : false,
    })
    .select("id")
    .single();

  if (error) return { inserted: false, id: null, error: error.message };

  // Only notify the super-admin on real-time inbounds; skip notifications during historical backfill.
  const isBackfillRow = Date.now() - new Date(msg.createdAtIso).getTime() > 24 * 60 * 60 * 1000;
  if (!msg.fromPage && !isBackfillRow) {
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", "ceo@cdsspace.pro")
      .maybeSingle();
    if (adminProfile?.id) {
      await supabase.from("notifications").insert({
        user_id: adminProfile.id,
        type: "new_message",
        title: `${msg.platform === "facebook" ? "Facebook" : "Instagram"} · ${msg.displayName || msg.externalUserId}`,
        message: msg.body.length > 100 ? msg.body.slice(0, 100) + "..." : msg.body,
        link: `/admin/messages?room=${encodeURIComponent(roomId)}`,
      });
    }
  }

  return { inserted: true, id: inserted?.id };
}
