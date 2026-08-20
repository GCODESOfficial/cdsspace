import { NextRequest, NextResponse } from "next/server";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { listConnectionSummaries } from "@/lib/social/connections";
import { publishContentToPlatform } from "@/lib/social/publish";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Publish a content item now to one or more connected channels.
 * Body: { platforms?: string[] }. Defaults to the item's own `platforms`
 * targets that are actually connected.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, deny } = await requireContentHub("content_hub.publish");
  if (deny || !session) return deny || NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const requested = Array.isArray(body.platforms)
    ? body.platforms.filter((p: unknown): p is SocialPlatform => typeof p === "string" && (SOCIAL_PLATFORMS as string[]).includes(p))
    : [];

  const item = await glashMaybeOne<{ id: string; platforms: string[] | null }>(
    `select id, platforms from public.content_items where id = $1 and status <> 'deleted' limit 1`,
    [id],
  );
  if (!item) return NextResponse.json({ ok: false, error: "Content item not found." }, { status: 404 });

  const channels = await listConnectionSummaries();
  const connected = new Set(channels.filter((c) => c.connected).map((c) => c.platform));

  // Chosen platforms, else the item's own targets - limited to connected ones.
  const candidates: string[] = requested.length ? requested : (item.platforms || []);
  const targets = candidates
    .filter((p: string): p is SocialPlatform => (SOCIAL_PLATFORMS as string[]).includes(p) && connected.has(p as SocialPlatform));

  if (!targets.length) {
    return NextResponse.json({ ok: false, error: "None of the target platforms are connected. Connect a channel in settings first." }, { status: 409 });
  }

  const results = [];
  for (const platform of targets) {
    try {
      results.push(await publishContentToPlatform({ contentId: id, platform, actor: session.email, trigger: "manual" }));
    } catch (error) {
      results.push({ ok: false, platform, status: "failed" as const, error: error instanceof Error ? error.message : "Publish failed." });
    }
  }

  const published = results.filter((r) => r.status === "published").length;
  return NextResponse.json({ ok: results.some((r) => r.ok), published, results });
}
