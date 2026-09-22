import "server-only";

import { getEssentialChatSticker, type CustomChatSticker } from "@/lib/chat-stickers";

export async function resolveChatSticker(
  db: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  candidate: unknown,
): Promise<{
  stickerKey: string;
  attachmentUrl: string | null;
  mimeType: string | null;
  metadata: { custom_sticker?: CustomChatSticker };
} | null> {
  const stickerKey = typeof candidate === "string" ? candidate.trim() : "";
  if (!stickerKey) return null;
  if (getEssentialChatSticker(stickerKey)) {
    return { stickerKey, attachmentUrl: null, mimeType: null, metadata: {} };
  }
  if (!stickerKey.startsWith("custom:")) throw new Error("Unknown sticker.");
  const id = stickerKey.slice("custom:".length);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new Error("Invalid sticker.");

  const { data, error } = await db
    .from("team_chat_stickers")
    .select("id, title, asset_url, emoji, background, mime_type, created_at")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This sticker is no longer available.");
  return {
    stickerKey,
    attachmentUrl: data.asset_url || null,
    mimeType: data.mime_type || null,
    metadata: { custom_sticker: data as CustomChatSticker },
  };
}
