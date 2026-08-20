import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin, cleanText, requestFingerprint } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const comments = await glashQuery(
    `select c.id, c.parent_id, c.body, c.likes_count, c.edited_at, c.created_at,
            p.full_name as author_name, p.avatar_url as author_avatar
     from public.intelligence_comments c
     join public.blog_posts bp on bp.id = c.post_id
     left join public.profiles p on p.id = c.user_id
     where bp.slug = $1 and c.status = 'approved' and c.deleted_at is null
       and ((bp.access_level = 'public' and (bp.status = 'published' or (bp.status = 'scheduled' and bp.published_at <= now())))
         or ($2::uuid is not null and bp.access_level = 'account')
         or ($2::uuid is not null and bp.access_level = 'private_client' and bp.assigned_client_id = $2::uuid))
     order by c.created_at asc`,
    [slug, user?.id || null],
  );
  return NextResponse.json({ ok: true, comments, count: comments.length });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin" }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in to comment." }, { status: 401 });

  const fingerprint = requestFingerprint(req);
  if (!checkIntelligenceRateLimit(`comment:${user.id}:${fingerprint}`, 6, 5 * 60_000).allowed) {
    return NextResponse.json({ ok: false, error: "Please wait before posting another comment." }, { status: 429 });
  }
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const text = cleanText(body.body, 4000);
  if (text.length < 2) return NextResponse.json({ ok: false, error: "Write a comment before posting." }, { status: 400 });
  if ((text.match(/https?:\/\//gi) || []).length > 2) return NextResponse.json({ ok: false, error: "Comments can include up to two links." }, { status: 400 });

  const post = await glashMaybeOne<{ id: string; comments_enabled: boolean; replies_enabled: boolean }>(
    `select id, comments_enabled, replies_enabled from public.blog_posts
     where slug = $1 and deleted_at is null and (
       (access_level = 'public' and (status = 'published' or (status = 'scheduled' and published_at <= now())))
       or (access_level = 'account')
       or (access_level = 'private_client' and assigned_client_id = $2)
     )`,
    [slug, user.id],
  );
  if (!post || !post.comments_enabled) return NextResponse.json({ ok: false, error: "Comments are closed." }, { status: 403 });

  const parentId = String(body.parentId || "") || null;
  if (parentId && !post.replies_enabled) return NextResponse.json({ ok: false, error: "Replies are closed." }, { status: 403 });
  if (parentId) {
    const parent = await glashMaybeOne<{ id: string }>(`select id from public.intelligence_comments where id = $1 and post_id = $2`, [parentId, post.id]);
    if (!parent) return NextResponse.json({ ok: false, error: "Reply target not found." }, { status: 404 });
  }

  const row = await glashMaybeOne(
    `insert into public.intelligence_comments (post_id, user_id, parent_id, body)
     values ($1,$2,$3,$4) returning id, parent_id, body, likes_count, edited_at, created_at`,
    [post.id, user.id, parentId, text],
  );
  const countRow = await glashMaybeOne<{ comments_count: number }>(
    `update public.blog_posts set comments_count = (select count(*) from public.intelligence_comments where post_id = $1 and status = 'approved' and deleted_at is null) where id = $1 returning comments_count`,
    [post.id],
  );
  const count = countRow?.comments_count ?? await glashMaybeOne<{ comments_count: number }>(
    `select comments_count from public.blog_posts where id = $1`,
    [post.id],
  ).then((result) => result?.comments_count ?? 0);
  return NextResponse.json({ ok: true, count, comment: { ...row, author_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Reader", author_avatar: user.user_metadata?.avatar_url || null } });
}
