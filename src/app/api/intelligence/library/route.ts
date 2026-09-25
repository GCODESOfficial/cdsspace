import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { listPublishedPosts } from "@/lib/blog/queries";
import { intelligenceViewer } from "@/lib/intelligence/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const user = await intelligenceViewer(supabase);
  try {
  const posts = await glashQuery(
    `select bp.id, bp.slug, bp.title, bp.subtitle, bp.excerpt, bp.cover_url, bp.category,
            bp.tags, bp.series, bp.reading_time, bp.views, bp.unique_views, bp.likes_count,
            bp.loves_count, bp.comments_count, bp.publication_type, bp.country, bp.city,
            bp.industry, bp.company_analysed, bp.featured, bp.published_at, bp.status,
            bp.access_level, bp.access_expires_at, bp.report_status,
            ba.name as author_name, ba.photo_url as author_photo, ba.position as author_position
     from public.blog_posts bp left join public.blog_authors ba on ba.id = bp.author_id
     where bp.deleted_at is null and (
       (bp.access_level = 'public' and (bp.status = 'published' or (bp.status = 'scheduled' and bp.published_at <= now())))
       or ($1::uuid is not null and bp.access_level = 'account' and bp.status = 'published')
       or ($1::uuid is not null and bp.access_level = 'private_client' and bp.assigned_client_id = $1::uuid and (bp.access_expires_at is null or bp.access_expires_at > now()))
     ) order by (bp.access_level = 'private_client') desc, bp.featured desc, coalesce(bp.published_at, bp.updated_at) desc`,
    [user?.id || null],
  );
  return NextResponse.json({ ok: true, posts });
  } catch (error) {
    if (!/column .* does not exist|relation .* does not exist/i.test(error instanceof Error ? error.message : String(error))) throw error;
    return NextResponse.json({ ok: true, posts: await listPublishedPosts(), migrationPending: true });
  }
}
