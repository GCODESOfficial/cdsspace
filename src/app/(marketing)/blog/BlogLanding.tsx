"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Search, ArrowRight, Clock, Loader2, Calendar } from "lucide-react";
import type { BlogPost } from "@/lib/blog/constants";

// Advert carousel - moved here from the home page; shown at the foot of the blog.
const DisplayAdCarousel = dynamic(() => import("@/components/DisplayAd"));

function fmtDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function CoverImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-[#040B37] ${className || ""}`}>
        <span className="text-white/30 text-sm font-semibold tracking-wide">CDS Space</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`object-cover ${className || ""}`} loading="lazy" />;
}

export default function BlogLanding() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/blog/list", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPosts(j.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const present = new Set(posts.map((p) => p.category).filter(Boolean));
    return ["All", ...Array.from(present).sort((a, b) => a.localeCompare(b))];
  }, [posts]);

  const featured = posts[0] || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      const matchesCat = category === "All" || p.category === category;
      const matchesSearch = !q ||
        p.title.toLowerCase().includes(q) ||
        (p.excerpt || "").toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q));
      return matchesCat && matchesSearch;
    });
  }, [posts, category, search]);

  // Featured is shown separately only in the unfiltered default view.
  const isDefaultView = category === "All" && !search.trim();
  const gridPosts = isDefaultView && featured ? filtered.filter((p) => p.id !== featured.id) : filtered;

  return (
    <main className="min-h-screen bg-brand-bg selection:bg-brand-blue selection:text-white">
      {/* Hero */}
      <section className="px-4 pt-[120px] pb-10 sm:px-6 md:pt-[150px] md:pb-14 lg:px-10">
        <div className="mx-auto max-w-[1200px] text-center">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-blue">CDS Space Blog</p>
          <h1 className="mx-auto max-w-[820px] text-balance text-[34px] font-bold leading-[1.1] tracking-[-1px] text-brand-navy sm:text-[48px] md:text-[60px]">
            Insights. Research. Growth.
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-relaxed text-brand-body md:text-[17px]">
            Thoughts, case studies, audits, and insights from CDS Space.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6 lg:px-10">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-brand-blue" /></div>
        ) : posts.length === 0 ? (
          <div className="rounded-[24px] border border-brand-stroke bg-white px-6 py-20 text-center shadow-sm">
            <p className="text-[17px] font-semibold text-brand-navy">No articles yet</p>
            <p className="mt-2 text-[14px] text-brand-body/70">New insights are on the way - check back soon.</p>
          </div>
        ) : (
          <>
            {/* Featured */}
            {isDefaultView && featured && (
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-12">
                <Link href={`/blog/${featured.slug}`} className="group grid overflow-hidden rounded-[28px] border border-brand-stroke bg-white shadow-sm transition hover:shadow-[0_24px_56px_rgba(4,11,55,0.10)] md:grid-cols-2">
                  <CoverImage src={featured.cover_url} alt={featured.title} className="h-60 w-full md:h-full md:min-h-[340px]" />
                  <div className="flex flex-col justify-center gap-4 p-7 md:p-10">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-brand-blue">{featured.category}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-body/50">Featured</span>
                    </div>
                    <h2 className="text-balance text-[26px] font-bold leading-tight text-brand-navy transition group-hover:text-brand-blue md:text-[34px]">{featured.title}</h2>
                    {featured.excerpt && <p className="line-clamp-3 text-[15px] leading-relaxed text-brand-body/80">{featured.excerpt}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-brand-body/60">
                      {featured.author_name && <span className="font-medium text-brand-navy">{featured.author_name}</span>}
                      <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{fmtDate(featured.published_at)}</span>
                      <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{featured.reading_time} min read</span>
                    </div>
                    <span className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-blue">Read article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </div>
                </Link>
              </motion.div>
            )}

            {/* Filters + search */}
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {categories.map((c) => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-[13px] font-medium transition ${
                      category === c ? "border-brand-navy bg-brand-navy text-white" : "border-brand-stroke bg-white text-brand-body hover:border-brand-blue/50 hover:text-brand-blue"
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="relative w-full lg:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-body/40" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search articles…"
                  className="w-full rounded-full border border-brand-stroke bg-white py-2.5 pl-9 pr-4 text-[14px] text-brand-navy outline-none transition focus:border-brand-blue/50" />
              </div>
            </div>

            {/* Cards */}
            {gridPosts.length === 0 ? (
              <p className="py-16 text-center text-[14px] text-brand-body/60">No articles match this filter.</p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {gridPosts.map((p, i) => (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 3) * 0.05 }}>
                    <Link href={`/blog/${p.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[22px] border border-brand-stroke bg-white shadow-sm transition hover:border-brand-blue/40 hover:shadow-[0_20px_45px_rgba(4,11,55,0.08)]">
                      <CoverImage src={p.cover_url} alt={p.title} className="h-44 w-full" />
                      <div className="flex flex-1 flex-col gap-3 p-5">
                        <span className="w-fit rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-brand-blue">{p.category}</span>
                        <h3 className="line-clamp-2 text-[17px] font-bold leading-snug text-brand-navy transition group-hover:text-brand-blue">{p.title}</h3>
                        {p.excerpt && <p className="line-clamp-2 text-[13px] leading-relaxed text-brand-body/75">{p.excerpt}</p>}
                        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] text-brand-body/55">
                          {p.author_name && <span className="font-medium text-brand-navy/80">{p.author_name}</span>}
                          <span>{fmtDate(p.published_at)}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{p.reading_time}m</span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Advert carousel (relocated from the home page) */}
      <section className="px-4 pb-16 sm:px-6 lg:px-10">
        <DisplayAdCarousel />
      </section>
    </main>
  );
}
