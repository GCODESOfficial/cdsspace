export interface CustomChatSticker {
  id: string;
  title: string;
  asset_url: string | null;
  emoji: string | null;
  background?: string | null;
  mime_type: string | null;
  owner_key?: string;
  created_at?: string;
}

export interface ChatStickerSelection {
  stickerKey: string;
  attachmentUrl?: string | null;
  mimeType?: string | null;
  metadata?: { custom_sticker: CustomChatSticker };
}

export const ESSENTIAL_CHAT_STICKERS = [
  { key: "cheer-burst", emoji: "🎉", notoCode: "1f389", title: "Celebrate", motion: "cds-sticker-pop" },
  { key: "love-note", emoji: "💙", notoCode: "1f499", title: "Appreciate", motion: "cds-sticker-pulse" },
  { key: "great-job", emoji: "👏", notoCode: "1f44f", title: "Great job", motion: "cds-sticker-wiggle" },
  { key: "mind-blown", emoji: "🤯", notoCode: "1f92f", title: "Mind blown", motion: "cds-sticker-pop" },
  { key: "ship-it", emoji: "🚀", notoCode: "1f680", title: "Ship it", motion: "cds-sticker-float" },
  { key: "coffee-break", emoji: "☕", notoCode: "2615", title: "Coffee", motion: "cds-sticker-pulse" },
] as const;

export function getEssentialChatSticker(key: string | null | undefined) {
  return ESSENTIAL_CHAT_STICKERS.find((sticker) => sticker.key === key) || null;
}

export function animatedNotoStickerUrl(code: string) {
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;
}
