import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Calendar, ArrowRight, ArrowLeft } from "lucide-react";
import { getPublishedPost, getRelatedPosts } from "@/lib/blog/queries";
import { glashQuery } from "@/lib/glashdb/postgres";
import { postUrl, SITE_URL } from "@/lib/blog/constants";
import PostInteractions from "./PostInteractions";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: "Article - CDS Space Blog", robots: { index: false, follow: false } };

  const title = post.seo_title || `${post.title} - CDS Space Blog`;
  const description = post.seo_description || post.excerpt || "Insights from CDS Space.";
  const url = postUrl(slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title, description, url, type: "article", siteName: "CDS Space",
      ...(post.published_at ? { publishedTime: post.published_at } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function fmtDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  // Best-effort view increment (never blocks render).
  glashQuery(`update public.blog_posts set views = views + 1 where id = $1`, [post.id]).catch(() => {});

  const related = await getRelatedPosts(slug, post.category, post.tags || []);

  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || post.seo_description || "",
    image: post.cover_url || undefined,
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at,
    author: post.author_name ? { "@type": "Person", name: post.author_name } : { "@type": "Organization", name: "CDS Space" },
    publisher: { "@type": "Organization", name: "CDS Space", url: SITE_URL },
    mainEntityOfPage: postUrl(slug),
  };

  return (
    <main className="min-h-screen bg-brand-bg selection:bg-brand-blue selection:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <article className="mx-auto max-w-[820px] px-4 pb-24 pt-[120px] sm:px-6 md:pt-[150px]">
        <Link href="/blog" className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue hover:underline">
          <ArrowLeft className="h-4 w-4" /> All articles
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-brand-blue">{post.category}</span>
          {post.series && <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-brand-body/70">{post.series}</span>}
        </div>

        <h1 className="mt-4 text-balance text-[32px] font-bold leading-[1.12] tracking-[-0.5px] text-brand-navy md:text-[46px]">{post.title}</h1>
        {post.subtitle && <p className="mt-3 text-[17px] leading-relaxed text-brand-body/80 md:text-[19px]">{post.subtitle}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-brand-body/60">
          {post.author_name && <span className="font-semibold text-brand-navy">{post.author_name}</span>}
          <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{fmtDate(post.published_at)}</span>
          <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />{post.reading_time} min read</span>
        </div>

        {post.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.cover_url} alt={post.title} className="mt-8 aspect-[16/9] w-full rounded-[24px] object-cover" />
        )}

        <div className="legal-prose blog-content mt-10 max-w-none" dangerouslySetInnerHTML={{ __html: post.content || "" }} />

        <div className="mt-10">
          <PostInteractions
            slug={post.slug}
            title={post.title}
            url={postUrl(post.slug)}
            initialLikes={post.likes_count}
            initialDislikes={post.dislikes_count}
            sharingEnabled={post.sharing_enabled}
            reactionsEnabled={post.reactions_enabled}
          />
        </div>

        {/* Author */}
        {post.author_name && (
          <div className="mt-10 flex items-start gap-4 rounded-[24px] border border-brand-stroke bg-white p-6">
            {post.author_photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.author_photo} alt={post.author_name} className="h-14 w-14 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#040B37] text-lg font-bold text-white">{post.author_name.charAt(0)}</div>
            )}
            <div>
              <p className="text-[15px] font-bold text-brand-navy">{post.author_name}</p>
              {post.author_position && <p className="text-[12px] font-medium text-brand-blue">{post.author_position}</p>}
              {post.author_bio && <p className="mt-1.5 text-[13px] leading-relaxed text-brand-body/75">{post.author_bio}</p>}
            </div>
          </div>
        )}
      </article>

      {/* Related */}
      {related.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6 lg:px-10">
          <h2 className="mb-6 text-[22px] font-bold text-brand-navy">Related articles</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <Link key={p.id} href={`/blog/${p.slug}`} className="group flex flex-col overflow-hidden rounded-[22px] border border-brand-stroke bg-white shadow-sm transition hover:border-brand-blue/40 hover:shadow-[0_20px_45px_rgba(4,11,55,0.08)]">
                {p.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.cover_url} alt={p.title} className="h-40 w-full object-cover" loading="lazy" />
                ) : <div className="flex h-40 w-full items-center justify-center bg-[#040B37] text-sm font-semibold text-white/30">CDS Space</div>}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <span className="w-fit rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-brand-blue">{p.category}</span>
                  <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-brand-navy transition group-hover:text-brand-blue">{p.title}</h3>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[13px] font-semibold text-brand-blue">Read <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
