import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin, classifyDevice, cleanText, requestFingerprint } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set([
  "view", "pdf_open", "pdf_page", "download", "print", "share", "reaction",
  "comment", "cta_click", "scroll_depth", "time_on_page", "private_acknowledge",
]);

type Params = Promise<{ slug: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const fingerprint = requestFingerprint(req);
  const rate = checkIntelligenceRateLimit(`track:${fingerprint}`, 120, 60_000);
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "Too many events" }, { status: 429 });

  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const eventType = String(body.event || "");
  if (!EVENT_TYPES.has(eventType)) return NextResponse.json({ ok: false, error: "Invalid event" }, { status: 400 });

  const post = await glashMaybeOne<{ id: string }>(
    `select id from public.blog_posts
     where slug = $1 and deleted_at is null
       and (status = 'published' or (status = 'scheduled' and published_at <= now()))
     limit 1`,
    [slug],
  );
  if (!post) return NextResponse.json({ ok: false, error: "Publication not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = Date.now();
  const bucket = Math.floor(now / (30 * 60 * 1000));
  const dedupeKey = eventType === "view" ? `${post.id}:${fingerprint}:view:${bucket}` : null;
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? JSON.stringify(Object.fromEntries(Object.entries(body.metadata).slice(0, 20)))
    : "{}";
  const inserted = await glashMaybeOne<{ id: string }>(
    `insert into public.intelligence_events
       (post_id, user_id, visitor_key, session_key, event_type, event_value, source, country, device, metadata, dedupe_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     on conflict (dedupe_key) where dedupe_key is not null do nothing
     returning id`,
    [
      post.id,
      user?.id || null,
      fingerprint,
      cleanText(body.sessionKey, 100) || null,
      eventType,
      Number.isFinite(Number(body.value)) ? Number(body.value) : null,
      cleanText(body.source || req.headers.get("referer"), 500) || null,
      cleanText(req.headers.get("x-vercel-ip-country"), 80) || null,
      classifyDevice(req.headers.get("user-agent")),
      metadata,
      dedupeKey,
    ],
  );

  if (inserted) {
    if (eventType === "view") {
      await glashQuery(
        `update public.blog_posts set
           views = views + 1,
           unique_views = (select count(distinct visitor_key) from public.intelligence_events where post_id = $1 and event_type = 'view')
         where id = $1`,
        [post.id],
      );
    } else {
      const counter: Record<string, string> = {
        share: "shares_count", download: "downloads_count", cta_click: "cta_clicks",
      };
      if (counter[eventType]) await glashQuery(`update public.blog_posts set ${counter[eventType]} = ${counter[eventType]} + 1 where id = $1`, [post.id]);
    }
  }
  return NextResponse.json({ ok: true, recorded: Boolean(inserted) });
}
