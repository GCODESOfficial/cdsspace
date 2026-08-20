import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin, requestFingerprint } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Like / Love toggle - logged-in users only. value: 1 (like) | 2 (love). */
export async function POST(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in to react." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const slug = String(body?.slug || "");
  const value = Number(body?.value);
  if (!slug || (value !== 1 && value !== 2)) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  if (!checkIntelligenceRateLimit(`reaction:${user.id}:${requestFingerprint(req)}`, 30, 60_000).allowed) {
    return NextResponse.json({ ok: false, error: "Please wait before reacting again." }, { status: 429 });
  }

  const post = await glashMaybeOne<{ id: string; reactions_enabled: boolean }>(
    `select id, reactions_enabled from public.blog_posts where slug = $1 and deleted_at is null and (
       (access_level = 'public' and (status = 'published' or (status = 'scheduled' and published_at <= now())))
       or access_level = 'account'
       or (access_level = 'private_client' and assigned_client_id = $2)
     )`,
    [slug, user.id],
  );
  if (!post) return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  if (!post.reactions_enabled) return NextResponse.json({ ok: false, error: "Reactions are disabled for this post." }, { status: 403 });

  const existing = await glashMaybeOne<{ value: number }>(
    `select value from public.blog_post_reactions where post_id = $1 and user_id = $2`,
    [post.id, user.id],
  );

  let mine: number | null = value;
  if (existing && existing.value === value) {
    // Toggle off.
    await glashQuery(`delete from public.blog_post_reactions where post_id = $1 and user_id = $2`, [post.id, user.id]);
    mine = null;
  } else {
    await glashQuery(
      `insert into public.blog_post_reactions (post_id, user_id, value) values ($1,$2,$3)
       on conflict (post_id, user_id) do update set value = excluded.value, created_at = now()`,
      [post.id, user.id, value],
    );
  }

  const counts = await glashMaybeOne<{ likes: number; loves: number }>(
    `update public.blog_posts set
       likes_count = (select count(*) from public.blog_post_reactions where post_id = $1 and value = 1),
       loves_count = (select count(*) from public.blog_post_reactions where post_id = $1 and value = 2),
       updated_at = now()
     where id = $1
     returning likes_count as likes, loves_count as loves`,
    [post.id],
  );

  return NextResponse.json({ ok: true, likes: counts?.likes ?? 0, loves: counts?.loves ?? 0, mine });
}

/** Returns the signed-in user's current reaction for a post (or null). */
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ ok: true, mine: null });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true, mine: null });
  const row = await glashMaybeOne<{ value: number }>(
    `select r.value from public.blog_post_reactions r
     join public.blog_posts p on p.id = r.post_id
     where p.slug = $1 and r.user_id = $2`,
    [slug, user.id],
  );
  return NextResponse.json({ ok: true, mine: row?.value ?? null });
}
