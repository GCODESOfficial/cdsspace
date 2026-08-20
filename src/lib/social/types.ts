import "server-only";

export type SocialPlatform = "linkedin" | "facebook" | "instagram" | "tiktok" | "x";

export const SOCIAL_PLATFORMS: SocialPlatform[] = ["linkedin", "facebook", "instagram", "tiktok", "x"];

export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X (Twitter)",
};

export class SocialError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SocialError";
    this.status = status;
  }
}

/** A stored, decrypted connection ready to publish with. */
export interface SocialConnection {
  platform: SocialPlatform;
  status: "connected" | "expired" | "revoked";
  accountName: string | null;
  accountUrn: string | null;
  scope: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown>;
}

/** What a provider returns after a successful OAuth exchange, to persist. */
export interface StoredConnectionInput {
  accountName: string | null;
  accountUrn: string | null;
  scope: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  metadata?: Record<string, unknown>;
}

/** The content_items fields a post is built from. */
export interface SocialContent {
  id: string;
  title: string;
  body: string | null;
  hashtags: string[] | null;
  ctaUrl: string | null;
  /** First image on the content item (raster or SVG); attached to the post. */
  imageUrl?: string | null;
}

export interface PublishResult {
  externalPostId: string | null;
  externalUrl: string | null;
}

export interface SocialProvider {
  platform: SocialPlatform;
  label: string;
  /** True when the env credentials needed to connect this platform are present. */
  isConfigured(): boolean;
  /** OAuth authorize URL to connect the CDS Space brand account. */
  getAuthUrl(input: { redirectUri: string; state: string }): string;
  /** Exchange the OAuth code for tokens + account info to store. */
  exchangeCode(input: { code: string; redirectUri: string }): Promise<StoredConnectionInput>;
  /** Publish one content item; returns the external post reference. */
  publish(connection: SocialConnection, content: SocialContent): Promise<PublishResult>;
}

/** Compose the post text shared across providers. */
export function buildPostText(content: SocialContent): string {
  const parts: string[] = [];
  const heading = content.title?.trim();
  const body = content.body?.trim();
  if (body) parts.push(body);
  else if (heading) parts.push(heading);
  const tags = (content.hashtags || [])
    .map((tag) => tag.trim().replace(/^#*/, ""))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  if (tags.length) parts.push(tags.join(" "));
  if (content.ctaUrl?.trim()) parts.push(content.ctaUrl.trim());
  return parts.join("\n\n").slice(0, 2900); // safely under the 3000-char LinkedIn limit
}
