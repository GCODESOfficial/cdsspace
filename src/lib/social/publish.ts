import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getConnection, isConnectionUsable, markConnectionStatus } from "@/lib/social/connections";
import { getProvider } from "@/lib/social/providers";
import { SocialError, type SocialContent, type SocialPlatform } from "@/lib/social/types";

interface ContentRow {
  id: string;
  title: string;
  body: string | null;
  hashtags: string[] | null;
  cta_url: string | null;
  status: string;
}

export interface PublishOutcome {
  ok: boolean;
  platform: SocialPlatform;
  status: "published" | "failed" | "skipped";
  externalUrl?: string | null;
  error?: string;
}

/**
 * Publish one content item to one platform, recording the attempt in
 * content_publications. Idempotent per (content, platform): an item already
 * published to a platform is skipped rather than double-posted.
 */
export async function publishContentToPlatform(input: {
  contentId: string;
  platform: SocialPlatform;
  actor: string;
  trigger?: "manual" | "scheduled";
}): Promise<PublishOutcome> {
  const trigger = input.trigger || "manual";
  const platform = input.platform;

  const content = await glashMaybeOne<ContentRow>(
    `select id, title, body, hashtags, cta_url, status from public.content_items where id = $1 and status <> 'deleted' limit 1`,
    [input.contentId],
  );
  if (!content) throw new SocialError("Content item was not found.", 404);

  // Already live on this platform? Don't repost.
  const existing = await glashMaybeOne<{ id: string; external_url: string | null }>(
    `select id, external_url from public.content_publications where content_id = $1 and platform = $2 and status = 'published' limit 1`,
    [input.contentId, platform],
  );
  if (existing) {
    return { ok: true, platform, status: "skipped", externalUrl: existing.external_url };
  }

  const provider = getProvider(platform);
  const connection = await getConnection(platform);
  if (!connection) throw new SocialError(`${provider.label} is not connected. Connect it in Content Hub settings.`, 409);
  if (!isConnectionUsable(connection)) {
    if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() <= Date.now()) {
      await markConnectionStatus(platform, "expired");
    }
    throw new SocialError(`${provider.label} needs to be reconnected (the access token is expired or revoked).`, 409);
  }

  // First image on the item (WOTD cards are SVG - the provider rasterizes).
  const image = await glashMaybeOne<{ url: string }>(
    `select url from public.content_media where content_id = $1 and kind = 'image' order by position, created_at limit 1`,
    [content.id],
  );

  const payload: SocialContent = {
    id: content.id,
    title: content.title,
    body: content.body,
    hashtags: content.hashtags,
    ctaUrl: content.cta_url,
    imageUrl: image?.url || null,
  };

  try {
    const result = await provider.publish(connection, payload);
    await glashQuery(
      `insert into public.content_publications
         (content_id, platform, status, external_post_id, external_url, trigger, requested_by, published_at)
       values ($1,$2,'published',$3,$4,$5,$6, now())`,
      [content.id, platform, result.externalPostId, result.externalUrl, trigger, input.actor],
    );
    return { ok: true, platform, status: "published", externalUrl: result.externalUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed.";
    if (error instanceof SocialError && error.status === 401) {
      await markConnectionStatus(platform, "expired");
    }
    await glashQuery(
      `insert into public.content_publications
         (content_id, platform, status, error, trigger, requested_by)
       values ($1,$2,'failed',$3,$4,$5)`,
      [content.id, platform, message.slice(0, 1000), trigger, input.actor],
    );
    return { ok: false, platform, status: "failed", error: message };
  }
}
