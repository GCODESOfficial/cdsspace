import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";
import type { BlogPost } from "./constants";

function intelligenceDefaults(post: Partial<BlogPost>): BlogPost {
  return {
    publication_type: "Executive Insight", executive_summary: null, country: null, city: null,
    industry: null, company_analysed: null, social_image_url: null, social_title: null,
    social_description: null, canonical_url: null, focus_keywords: [], cta_type: "none",
    cta_text: null, cta_url: null, cta_supporting_line: null, pdf_storage_path: null,
    pdf_display_name: null, pdf_page_count: null, pdf_preview_url: null, pdf_access_mode: "view",
    executive_summary_storage_path: null, video_url: null, supporting_media: [],
    comments_enabled: false, replies_enabled: false, downloads_enabled: false,
    printing_enabled: false, view_count_enabled: true, loves_count: Number(post.dislikes_count || 0),
    comments_count: 0, shares_count: 0, downloads_count: 0, cta_clicks: 0,
    unique_views: Number(post.views || 0), featured: false, access_level: "public",
    assigned_client_id: null, access_expires_at: null, private_token: null, internal_notes: null,
    report_status: "not_acknowledged", ai_assisted: false, approval_status: "not_requested",
    deleted_at: null, ...post,
  } as BlogPost;
}

function schemaIsPending(error: unknown) {
  return /column .* does not exist|relation .* does not exist/i.test(error instanceof Error ? error.message : String(error));
}

// A post is publicly visible when it's published, or scheduled with a past
// publish time. Hidden / archived / draft / deleted are never public.
const PUBLIC_PREDICATE =
  "(bp.status = 'published' or (bp.status = 'scheduled' and bp.published_at is not null and bp.published_at <= now()))" +
  " and bp.access_level = 'public' and bp.deleted_at is null";

const LIST_COLUMNS = `
  bp.id, bp.slug, bp.title, bp.subtitle, bp.excerpt, bp.cover_url, bp.category,
  bp.tags, bp.series, bp.reading_time, bp.views, bp.unique_views, bp.likes_count, bp.loves_count,
  bp.comments_count, bp.shares_count, bp.publication_type, bp.country, bp.city, bp.industry,
  bp.company_analysed, bp.featured, bp.pdf_storage_path, bp.published_at, bp.status,
  ba.name as author_name, ba.photo_url as author_photo, ba.position as author_position`;

export async function listPublishedPosts(): Promise<BlogPost[]> {
  try {
    return await glashQuery<BlogPost>(
      `select ${LIST_COLUMNS}
       from public.blog_posts bp
       left join public.blog_authors ba on ba.id = bp.author_id
       where ${PUBLIC_PREDICATE}
       order by coalesce(bp.published_at, bp.created_at) desc`,
    );
  } catch (error) {
    if (!schemaIsPending(error)) throw error;
    const legacy = await glashQuery<BlogPost>(
      `select bp.id, bp.slug, bp.title, bp.subtitle, bp.excerpt, bp.cover_url, bp.category,
              bp.tags, bp.series, bp.reading_time, bp.views, bp.likes_count, bp.dislikes_count,
              bp.published_at, bp.status, ba.name as author_name, ba.photo_url as author_photo,
              ba.position as author_position
       from public.blog_posts bp left join public.blog_authors ba on ba.id = bp.author_id
       where (bp.status = 'published' or (bp.status = 'scheduled' and bp.published_at is not null and bp.published_at <= now()))
       order by coalesce(bp.published_at, bp.created_at) desc`,
    );
    return legacy.map(intelligenceDefaults);
  }
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  try {
    return await glashMaybeOne<BlogPost>(
      `select bp.*, ba.name as author_name, ba.photo_url as author_photo,
              ba.position as author_position, ba.bio as author_bio,
              ba.is_external as author_is_external, ba.profile_url as author_profile_url,
              ba.organization as author_organization
       from public.blog_posts bp left join public.blog_authors ba on ba.id = bp.author_id
       where bp.slug = $1 and ${PUBLIC_PREDICATE} limit 1`, [slug],
    );
  } catch (error) {
    if (!schemaIsPending(error)) throw error;
    const legacy = await glashMaybeOne<BlogPost>(
      `select bp.*, ba.name as author_name, ba.photo_url as author_photo,
              ba.position as author_position, ba.bio as author_bio
       from public.blog_posts bp left join public.blog_authors ba on ba.id = bp.author_id
       where bp.slug = $1 and (bp.status = 'published' or (bp.status = 'scheduled' and bp.published_at <= now())) limit 1`, [slug],
    );
    return legacy ? intelligenceDefaults(legacy) : null;
  }
}

export async function getAccessiblePost(slug: string, privateToken?: string | null, userId?: string | null): Promise<BlogPost | null> {
  if (!privateToken && !userId) return getPublishedPost(slug);
  try {
    return await glashMaybeOne<BlogPost>(
      `select bp.*, ba.name as author_name, ba.photo_url as author_photo,
              ba.position as author_position, ba.bio as author_bio,
              ba.is_external as author_is_external, ba.profile_url as author_profile_url,
              ba.organization as author_organization
       from public.blog_posts bp left join public.blog_authors ba on ba.id = bp.author_id
       where bp.slug = $1 and bp.deleted_at is null
         and (($2 <> '' and bp.private_token::text = $2 and bp.access_level = 'private_client'
               and (bp.access_expires_at is null or bp.access_expires_at > now()))
              or ($3 <> '' and bp.assigned_client_id::text = $3 and bp.access_level = 'private_client'
                  and (bp.access_expires_at is null or bp.access_expires_at > now()))
              or ($3 <> '' and bp.access_level = 'account'
                  and (bp.status = 'published' or (bp.status = 'scheduled' and bp.published_at <= now())))
              or ${PUBLIC_PREDICATE}) limit 1`,
      [slug, privateToken || "", userId || ""],
    );
  } catch (error) {
    if (!schemaIsPending(error) || privateToken) throw error;
    return getPublishedPost(slug);
  }
}

export async function getRelatedPosts(slug: string, category: string, tags: string[]): Promise<BlogPost[]> {
  try {
    return await glashQuery<BlogPost>(
      `select ${LIST_COLUMNS} from public.blog_posts bp
       left join public.blog_authors ba on ba.id = bp.author_id
       where ${PUBLIC_PREDICATE} and bp.slug <> $1 and (bp.category = $2 or bp.tags && $3::text[])
       order by coalesce(bp.published_at, bp.created_at) desc limit 3`, [slug, category, tags ?? []],
    );
  } catch (error) {
    if (!schemaIsPending(error)) throw error;
    const legacy = await glashQuery<BlogPost>(
      `select bp.*, ba.name as author_name, ba.photo_url as author_photo, ba.position as author_position
       from public.blog_posts bp left join public.blog_authors ba on ba.id = bp.author_id
       where (bp.status = 'published' or (bp.status = 'scheduled' and bp.published_at <= now()))
         and bp.slug <> $1 and (bp.category = $2 or bp.tags && $3::text[])
       order by coalesce(bp.published_at, bp.created_at) desc limit 3`, [slug, category, tags ?? []],
    );
    return legacy.map(intelligenceDefaults);
  }
}
