import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessiblePost } from "@/lib/blog/queries";
import { sanitizeIntelligenceHtml } from "@/lib/intelligence/security";
import { intelligenceViewer } from "@/lib/intelligence/viewer";
import { mobileJson } from "@/lib/mobile-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

// One Intelligence publication for the app's native reader: the same access
// rules and sanitised HTML as the web page (blog/[slug]/page.tsx), returned as
// data. Only reader-facing fields; never internal notes or private tokens.
// The PDF, when there is one, streams from /api/intelligence/[slug]/document.
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { slug } = await params;
  const supabase = await createClient();
  const user = await intelligenceViewer(supabase);
  const token = req.nextUrl.searchParams.get("token");
  const post = await getAccessiblePost(slug, token, user?.id);
  if (!post) return mobileJson({ error: "This publication is not available." }, 404);

  return mobileJson({
    post: {
      slug: post.slug,
      title: post.title,
      subtitle: post.subtitle || null,
      excerpt: post.excerpt || null,
      executiveSummary: post.executive_summary || null,
      category: post.category || null,
      publicationType: post.publication_type || null,
      accessLevel: post.access_level,
      coverUrl: post.cover_url || null,
      publishedAt: post.published_at || post.created_at,
      readingTime: post.reading_time || null,
      location: [post.city, post.country].filter(Boolean).join(", ") || null,
      author: post.author_name
        ? { name: post.author_name, position: post.author_position || null, photoUrl: post.author_photo || null }
        : null,
      contentHtml: sanitizeIntelligenceHtml(post.content || ""),
      videoUrl: post.video_url || null,
      pdf: post.pdf_storage_path
        ? { name: post.pdf_display_name || `${post.title}.pdf`, pageCount: post.pdf_page_count || null, accessMode: post.pdf_access_mode }
        : null,
      cta: post.cta_text || post.cta_url ? { text: post.cta_text || null, url: post.cta_url || null } : null,
    },
  });
}
