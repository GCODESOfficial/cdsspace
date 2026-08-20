import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BarChart3, Calendar, Clock, ExternalLink, Eye, Globe2, Heart, MessageCircle } from "lucide-react";
import { getAccessiblePost, getPublishedPost, getRelatedPosts } from "@/lib/blog/queries";
import { postUrl, SITE_URL } from "@/lib/blog/constants";
import { sanitizeIntelligenceHtml } from "@/lib/intelligence/security";
import PublicationTracker from "@/components/intelligence/PublicationTracker";
import IntelligencePdfViewer from "@/components/intelligence/IntelligencePdfViewer";
import IntelligenceCover from "@/components/intelligence/IntelligenceCover";
import IntelligenceComments from "@/components/intelligence/IntelligenceComments";
import PublicationCta from "@/components/intelligence/PublicationCta";
import PrivateAssessmentPanel from "@/components/intelligence/PrivateAssessmentPanel";
import PostInteractions from "./PostInteractions";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: "Publication - CDS Space Intelligence", robots: { index: false, follow: false } };
  const title = post.seo_title || post.social_title || `${post.title} - CDS Space Intelligence`;
  const description = post.seo_description || post.social_description || post.excerpt || "Research and market intelligence from CDS Space.";
  const url = post.canonical_url || postUrl(slug);
  const image = post.social_image_url || post.cover_url || undefined;
  return {
    title, description, alternates: { canonical: url }, keywords: post.focus_keywords || post.tags,
    openGraph: { title, description, url, type: "article", siteName: "CDS Space Intelligence", images: image ? [{ url: image }] : undefined, ...(post.published_at ? { publishedTime: post.published_at } : {}) },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
}

function embedUrl(raw: string | null) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
    if (url.hostname.endsWith("youtube.com")) return `https://www.youtube-nocookie.com/embed/${url.searchParams.get("v") || url.pathname.split("/").pop()}`;
    if (url.hostname.endsWith("vimeo.com")) return `https://player.vimeo.com/video/${url.pathname.split("/").filter(Boolean).pop()}`;
    return null;
  } catch { return null; }
}

export default async function IntelligencePublicationPage({ params, searchParams }: { params: Params; searchParams?: Promise<{ token?: string }> }) {
  const { slug } = await params;
  const privateToken = (await searchParams)?.token || null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const post = await getAccessiblePost(slug, privateToken, user?.id);
  if (!post) notFound();
  const [related, safeContent] = await Promise.all([
    getRelatedPosts(slug, post.category, post.tags || []),
    Promise.resolve(sanitizeIntelligenceHtml(post.content || "")),
  ]);
  const video = embedUrl(post.video_url);
  const location = [post.city, post.country].filter(Boolean).join(", ");
  const ctaHref = post.cta_url || (post.cta_type === "book_consultation" ? "/consultation" : post.cta_type === "contact_team" ? "/contact" : "/brand-brief");
  const ctaTitle = post.cta_text || (post.cta_type === "request_assessment" ? "Request a private brand infrastructure assessment" : "Turn this intelligence into action");
  const ld = {
    "@context": "https://schema.org", "@type": post.publication_type?.includes("Report") || post.publication_type?.includes("Assessment") ? "Report" : "Article",
    headline: post.title, description: post.excerpt || post.seo_description || "", image: post.cover_url || undefined,
    datePublished: post.published_at || post.created_at, dateModified: post.updated_at,
    author: post.author_name ? { "@type": "Person", name: post.author_name, ...(post.author_profile_url ? { url: post.author_profile_url } : {}) } : { "@type": "Organization", name: "CDS Space Intelligence" },
    publisher: { "@type": "Organization", name: "CDS Space", url: SITE_URL }, mainEntityOfPage: postUrl(slug),
    ...(post.original_source_url ? { citation: post.original_source_url, isBasedOn: post.original_source_url } : {}),
  };

  return <main className="min-h-screen bg-[#F7F9FD] selection:bg-brand-blue selection:text-white">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    <PublicationTracker slug={post.slug} />

    <article className="pb-24 pt-[112px] md:pt-[138px]">
      <header className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-10">
        <Link href="/intelligence" className="inline-flex items-center gap-2 text-[12px] font-semibold text-brand-blue hover:underline"><ArrowLeft className="size-4" />Intelligence library</Link>
        <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_260px] lg:items-end">
          <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-[4px] bg-[#EAF1FF] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-brand-blue">{post.publication_type || "Executive Insight"}</span><span className="text-[11px] font-medium text-brand-body/55">{post.category}</span></div><h1 className="mt-5 max-w-[880px] text-balance text-[36px] font-bold leading-[1.06] tracking-[-.035em] text-brand-navy sm:text-[50px] lg:text-[62px]">{post.title}</h1>{post.subtitle && <p className="mt-5 max-w-[800px] text-[17px] leading-7 text-brand-body/80 sm:text-[19px]">{post.subtitle}</p>}</div>
          <dl className="grid grid-cols-2 gap-3 rounded-[12px] border border-brand-stroke bg-white p-4 text-[11px] lg:grid-cols-1"><div><dt className="uppercase tracking-[.12em] text-brand-body/45">Published</dt><dd className="mt-1 font-semibold text-brand-navy">{fmtDate(post.published_at)}</dd></div><div><dt className="uppercase tracking-[.12em] text-brand-body/45">Reading time</dt><dd className="mt-1 font-semibold text-brand-navy">{post.reading_time} minutes</dd></div>{post.industry && <div><dt className="uppercase tracking-[.12em] text-brand-body/45">Industry</dt><dd className="mt-1 font-semibold text-brand-navy">{post.industry}</dd></div>}{location && <div><dt className="uppercase tracking-[.12em] text-brand-body/45">Market</dt><dd className="mt-1 font-semibold text-brand-navy">{location}</dd></div>}</dl>
        </div>

        {(post.cover_url || post.pdf_storage_path) && <div className="mt-9 aspect-[16/8] w-full overflow-hidden rounded-[16px] shadow-[0_25px_70px_rgba(4,11,55,.10)]"><IntelligenceCover slug={post.slug} title={post.title} coverUrl={post.cover_url} hasPdf={Boolean(post.pdf_storage_path)} token={privateToken} eager /></div>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-b border-brand-stroke pb-6 text-[11px] text-brand-body/60"><div className="flex flex-wrap items-center gap-x-5 gap-y-2">{post.author_name && <span className="font-bold text-brand-navy">By {post.author_name}</span>}{post.original_source_url && <a href={post.original_source_url} target="_blank" rel="noopener noreferrer external" className="inline-flex items-center gap-1.5 font-semibold text-brand-blue hover:underline">Original post <ExternalLink className="size-3.5" /></a>}<span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5" />{fmtDate(post.published_at)}</span><span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" />{post.reading_time} min</span>{post.view_count_enabled && <span className="inline-flex items-center gap-1.5"><Eye className="size-3.5" />{post.views.toLocaleString()} views</span>}</div><div className="flex items-center gap-4"><span className="inline-flex items-center gap-1.5"><Heart className="size-3.5" />{(post.likes_count + post.loves_count).toLocaleString()}</span><span className="inline-flex items-center gap-1.5"><MessageCircle className="size-3.5" />{post.comments_count.toLocaleString()}</span></div></div>
      </header>

      <div className="mx-auto mt-10 grid max-w-[1120px] gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,760px)_220px] lg:px-10">
        <div className="min-w-0">
          {post.access_level === "private_client" && <PrivateAssessmentPanel slug={post.slug} status={post.report_status} expiresAt={post.access_expires_at} />}
          {post.executive_summary && <section className="mb-10 rounded-[16px] border border-[#BED1FF] bg-[#EEF4FF] p-6 sm:p-7"><div className="flex items-center gap-2 text-brand-blue"><BarChart3 className="size-4" /><h2 className="text-[11px] font-bold uppercase tracking-[.14em]">Executive summary</h2></div><p className="mt-4 whitespace-pre-line text-[15px] leading-7 text-brand-navy/85">{post.executive_summary}</p></section>}
          {video && <div className="mb-10 aspect-video overflow-hidden rounded-[16px] border border-brand-stroke bg-black"><iframe src={video} title={`Video for ${post.title}`} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full border-0" /></div>}
          <div className="legal-prose blog-content intelligence-content max-w-none" dangerouslySetInnerHTML={{ __html: safeContent }} />
          {post.pdf_storage_path && <IntelligencePdfViewer slug={post.slug} title={post.title} pageCount={post.pdf_page_count} accessMode={post.pdf_access_mode} publicationType={post.publication_type} initialPreviewUrl={post.pdf_preview_url || post.cover_url} token={privateToken || undefined} />}
          {post.cta_type !== "none" && <PublicationCta slug={post.slug} title={ctaTitle} supportingLine={post.cta_supporting_line} href={ctaHref} />}
          <div className="mt-10"><PostInteractions slug={post.slug} title={post.title} url={postUrl(post.slug)} initialLikes={post.likes_count} initialLoves={post.loves_count} sharingEnabled={post.sharing_enabled} reactionsEnabled={post.reactions_enabled} /></div>
          {post.comments_enabled && <IntelligenceComments slug={post.slug} initialCount={post.comments_count} repliesEnabled={post.replies_enabled} isSignedIn={Boolean(user)} />}
          {post.author_name && <div className="mt-12 flex items-start gap-4 rounded-[16px] border border-brand-stroke bg-white p-6">{post.author_photo ? <img src={post.author_photo} alt={post.author_name} className="size-14 shrink-0 rounded-full object-cover" /> : <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[#040B37] text-lg font-bold text-white">{post.author_name.charAt(0)}</div>}<div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-brand-body/45">{post.author_is_external ? "Report originator" : "Research author"}</p><p className="mt-1 text-[15px] font-bold text-brand-navy">{post.author_name}</p>{(post.author_position || post.author_organization) && <p className="text-[12px] font-medium text-brand-blue">{[post.author_position, post.author_organization].filter(Boolean).join(" · ")}</p>}{post.author_bio && <p className="mt-2 text-[13px] leading-6 text-brand-body/75">{post.author_bio}</p>}{post.author_profile_url && <a href={post.author_profile_url} target="_blank" rel="noopener noreferrer external" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-blue hover:underline">{post.author_is_external ? "Originator profile" : "Author profile"} <ExternalLink className="size-3.5" /></a>}</div></div>}
        </div>
        <aside className="hidden lg:block"><div className="sticky top-28 space-y-4 rounded-[12px] border border-brand-stroke bg-white p-4 text-[11px]"><p className="font-bold uppercase tracking-[.12em] text-brand-body/45">Research context</p>{post.company_analysed && <div><p className="text-brand-body/50">Company analysed</p><p className="mt-1 font-semibold text-brand-navy">{post.company_analysed}</p></div>}{post.industry && <div><p className="text-brand-body/50">Industry</p><p className="mt-1 font-semibold text-brand-navy">{post.industry}</p></div>}{location && <div className="flex gap-2"><Globe2 className="mt-0.5 size-3.5 text-brand-blue" /><div><p className="text-brand-body/50">Market</p><p className="mt-1 font-semibold text-brand-navy">{location}</p></div></div>}{post.tags?.length > 0 && <div className="flex flex-wrap gap-1.5 pt-2">{post.tags.map((tag) => <span key={tag} className="rounded-[4px] bg-[#F3F6FB] px-2 py-1 text-[9px] font-medium text-brand-body">{tag}</span>)}</div>}</div></aside>
      </div>
    </article>

    {related.length > 0 && <section className="border-t border-brand-stroke bg-white"><div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6 lg:px-10"><div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-brand-blue">Continue researching</p><h2 className="mt-2 text-[26px] font-bold text-brand-navy">Related intelligence</h2></div><Link href="/intelligence" className="text-[12px] font-semibold text-brand-blue">View library</Link></div><div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{related.map((item) => <Link key={item.id} href={`/intelligence/${item.slug}`} className="group rounded-[12px] border border-brand-stroke bg-[#FAFBFE] p-5 transition hover:border-brand-blue/40"><span className="text-[9px] font-bold uppercase tracking-[.12em] text-brand-blue">{item.publication_type}</span><h3 className="mt-3 line-clamp-2 text-[16px] font-bold leading-snug text-brand-navy group-hover:text-brand-blue">{item.title}</h3><div className="mt-5 flex items-center justify-between text-[10px] text-brand-body/55"><span>{item.reading_time} min read</span><ArrowRight className="size-4 text-brand-blue" /></div></Link>)}</div></div></section>}
  </main>;
}
