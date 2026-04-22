import { getSupabaseAdmin } from "@/lib/supabase";
import { normalisePhone, waRoomIdFromPhone } from "./config";

export interface InboundWhatsAppMessage {
  source: "whatsapp_cloud" | "whatsapp_qr";
  fromPhone: string;
  waName?: string | null;
  body: string;
  externalId: string;
  externalThreadId?: string | null;
  mediaUrl?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Idempotent: if (source, external_id) already exists we skip.
 * Creates/refreshes the whatsapp_contacts row and notifies the super-admin.
 */
export async function ingestInboundWhatsApp(msg: InboundWhatsAppMessage) {
  const supabase = getSupabaseAdmin();
  const phone = normalisePhone(msg.fromPhone);
  const roomId = waRoomIdFromPhone(phone);

  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("source", msg.source)
    .eq("external_id", msg.externalId)
    .maybeSingle();
  if (existing?.id) return { inserted: false, id: existing.id };

  await supabase
    .from("whatsapp_contacts")
    .upsert(
      {
        phone,
        wa_name: msg.waName ?? null,
        last_inbound_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" },
    );

  const { data: contact } = await supabase
    .from("whatsapp_contacts")
    .select("client_id")
    .eq("phone", phone)
    .maybeSingle();

  const { data: inserted, error } = await supabase
    .from("chat_messages")
    .insert({
      room_id: roomId,
      sender_id: contact?.client_id ?? null,
      sender_role: "client",
      message: msg.body || "",
      file_url: msg.mediaUrl ?? null,
      source: msg.source,
      external_id: msg.externalId,
      external_thread_id: msg.externalThreadId ?? null,
      external_metadata: msg.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) return { inserted: false, id: null, error: error.message };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", "ceo@cdsspace.pro")
    .maybeSingle();

  if (adminProfile?.id) {
    await supabase.from("notifications").insert({
      user_id: adminProfile.id,
      type: "new_message",
      title: `WhatsApp · ${msg.waName || phone}`,
      message: msg.body.length > 100 ? msg.body.slice(0, 100) + "..." : msg.body,
      link: `/admin/messages?room=${encodeURIComponent(roomId)}`,
    });
  }

  return { inserted: true, id: inserted?.id };
}
