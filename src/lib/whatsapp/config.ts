import { getSupabaseAdmin } from "@/lib/supabase";

export type WhatsAppMode = "cloud_api" | "web_qr";

export interface WhatsAppIntegration {
  id: string;
  mode: WhatsAppMode;
  is_active: boolean;
  cloud_phone_number_id: string | null;
  cloud_waba_id: string | null;
  cloud_access_token: string | null;
  cloud_verify_token: string | null;
  cloud_business_phone: string | null;
  cloud_app_id: string | null;
  qr_session_id: string | null;
  qr_code: string | null;
  qr_status: "disconnected" | "pairing" | "connected" | "error";
  qr_linked_phone: string | null;
  qr_last_seen_at: string | null;
  qr_error: string | null;
  updated_at: string;
}

export async function getActiveWhatsAppIntegration(): Promise<WhatsAppIntegration | null> {
  // 1. Try Environment Variables first (Secure mode)
  if (process.env.WHATSAPP_CLOUD_ACCESS_TOKEN) {
    return {
      id: "env",
      mode: (process.env.WHATSAPP_MODE as WhatsAppMode) || "cloud_api",
      is_active: true,
      cloud_phone_number_id: process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || null,
      cloud_waba_id: process.env.WHATSAPP_CLOUD_WABA_ID || null,
      cloud_access_token: process.env.WHATSAPP_CLOUD_ACCESS_TOKEN,
      cloud_verify_token: process.env.WHATSAPP_CLOUD_VERIFY_TOKEN || null,
      cloud_business_phone: process.env.WHATSAPP_CLOUD_BUSINESS_PHONE || null,
      cloud_app_id: process.env.WHATSAPP_CLOUD_APP_ID || null,
      qr_session_id: null,
      qr_code: null,
      qr_status: "disconnected",
      qr_linked_phone: null,
      qr_last_seen_at: null,
      qr_error: null,
      updated_at: new Date().toISOString(),
    };
  }

  // 2. Fallback to DB
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("whatsapp_integrations")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  return (data as WhatsAppIntegration) || null;
}

export async function getIntegrationByMode(mode: WhatsAppMode): Promise<WhatsAppIntegration | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("whatsapp_integrations")
    .select("*")
    .eq("mode", mode)
    .maybeSingle();
  return (data as WhatsAppIntegration) || null;
}

export function waRoomIdFromPhone(phone: string): string {
  return `whatsapp_${normalisePhone(phone)}`;
}

export function phoneFromWaRoomId(roomId: string): string | null {
  if (!roomId.startsWith("whatsapp_")) return null;
  return roomId.slice("whatsapp_".length);
}

export function normalisePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}
