import { getSupabaseAdmin } from "@/lib/supabase";

export type MetaPlatform = "facebook" | "instagram";

export interface MetaIntegration {
  id: string;
  platform: MetaPlatform;
  is_active: boolean;
  page_id: string | null;
  page_name: string | null;
  page_access_token: string | null;
  ig_business_id: string | null;
  ig_username: string | null;
  verify_token: string | null;
  app_secret: string | null;
  scopes: string | null;
  backfill_status: "idle" | "running" | "done" | "error";
  backfill_cursor: string | null;
  backfill_since: string | null;
  backfill_until: string | null;
  backfill_messages_ingested: number;
  backfill_conversations_seen: number;
  backfill_last_error: string | null;
  backfill_started_at: string | null;
  backfill_finished_at: string | null;
}

export async function getMetaIntegration(platform: MetaPlatform): Promise<MetaIntegration | null> {
  // 1. Try Environment Variables first
  if (platform === "facebook" && process.env.FB_PAGE_ACCESS_TOKEN) {
    return {
      id: "env_fb",
      platform: "facebook",
      is_active: true,
      page_id: process.env.FB_PAGE_ID || null,
      page_name: process.env.FB_PAGE_NAME || "Facebook Page",
      page_access_token: process.env.FB_PAGE_ACCESS_TOKEN,
      ig_business_id: null,
      ig_username: null,
      verify_token: process.env.FB_VERIFY_TOKEN || null,
      app_secret: process.env.FB_APP_SECRET || null,
      scopes: null,
      backfill_status: "idle",
      backfill_cursor: null,
      backfill_since: null,
      backfill_until: null,
      backfill_messages_ingested: 0,
      backfill_conversations_seen: 0,
      backfill_last_error: null,
      backfill_started_at: null,
      backfill_finished_at: null,
    };
  }

  if (platform === "instagram" && process.env.IG_ACCESS_TOKEN) {
    return {
      id: "env_ig",
      platform: "instagram",
      is_active: true,
      page_id: process.env.IG_PAGE_ID || null,
      page_name: process.env.IG_PAGE_NAME || "Instagram Business",
      page_access_token: process.env.IG_ACCESS_TOKEN,
      ig_business_id: process.env.IG_BUSINESS_ID || null,
      ig_username: process.env.IG_USERNAME || null,
      verify_token: process.env.IG_VERIFY_TOKEN || null,
      app_secret: process.env.IG_APP_SECRET || null,
      scopes: null,
      backfill_status: "idle",
      backfill_cursor: null,
      backfill_since: null,
      backfill_until: null,
      backfill_messages_ingested: 0,
      backfill_conversations_seen: 0,
      backfill_last_error: null,
      backfill_started_at: null,
      backfill_finished_at: null,
    };
  }

  // 2. Fallback to DB
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("meta_integrations")
    .select("*")
    .eq("platform", platform)
    .maybeSingle();
  return (data as MetaIntegration) || null;
}

export function fbRoomId(psid: string): string {
  return `facebook_${psid}`;
}

export function igRoomId(igsid: string): string {
  return `instagram_${igsid}`;
}

export function roomIdFor(platform: MetaPlatform, externalId: string) {
  return platform === "facebook" ? fbRoomId(externalId) : igRoomId(externalId);
}

export function externalIdFromRoomId(roomId: string): { platform: MetaPlatform; id: string } | null {
  if (roomId.startsWith("facebook_")) return { platform: "facebook", id: roomId.slice("facebook_".length) };
  if (roomId.startsWith("instagram_")) return { platform: "instagram", id: roomId.slice("instagram_".length) };
  return null;
}
