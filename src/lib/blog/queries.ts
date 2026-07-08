import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";
import type { BlogPost } from "./constants";

// A post is publicly visible when it's published, or scheduled with a past
// publish time. Hidden / archived / draft / deleted are never public.
const PUBLIC_PREDICATE =
  "(bp.status = 'published' or (bp.status = 'scheduled' and bp.published_at is not null and bp.published_at <= now()))";

const LIST_COLUMNS = `
  bp.id, bp.slug, bp.title, bp.subtitle, bp.excerpt, bp.cover_url, bp.category,
  bp.tags, bp.series, bp.reading_time, bp.views, bp.likes_count, bp.dislikes_count,
  bp.published_at, bp.status,
  ba.name as author_name, ba.photo_url as author_photo, ba.position as author_position`;

export async function listPublishedPosts(): Promise<BlogPost[]> {
  return glashQuery<BlogPost>(
    `select ${LIST_COLUMNS}
     from public.blog_posts bp
     left join public.blog_authors ba on ba.id = bp.author_id
     where ${PUBLIC_PREDICATE}
     order by coalesce(bp.published_at, bp.created_at) desc`,
  );
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  return glashMaybeOne<BlogPost>(
    `select bp.*, ba.name as author_name, ba.photo_url as author_photo,
            ba.position as author_position, ba.bio as author_bio
     from public.blog_posts bp
     left join public.blog_authors ba on ba.id = bp.author_id
     where bp.slug = $1 and ${PUBLIC_PREDICATE}
     limit 1`,
    [slug],
  );
}

export async function getRelatedPosts(slug: string, category: string, tags: string[]): Promise<BlogPost[]> {
  return glashQuery<BlogPost>(
    `select ${LIST_COLUMNS}
     from public.blog_posts bp
     left join public.blog_authors ba on ba.id = bp.author_id
     where ${PUBLIC_PREDICATE} and bp.slug <> $1
       and (bp.category = $2 or bp.tags && $3::text[])
     order by coalesce(bp.published_at, bp.created_at) desc
     limit 3`,
    [slug, category, tags ?? []],
  );
}
