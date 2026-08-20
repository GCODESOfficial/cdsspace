"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Calendar, Clock, Eye, FileSearch, Globe2, Heart, Loader2, Search, X } from "lucide-react";
import type { BlogPost } from "@/lib/blog/constants";
import IntelligenceCover from "@/components/intelligence/IntelligenceCover";

function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

function Cover({ post, eager = false, className = "" }: { post: BlogPost; eager?: boolean; className?: string }) {
  return <IntelligenceCover slug={post.slug} title={post.title} coverUrl={post.cover_url} hasPdf={Boolean(post.pdf_storage_path)} eager={eager} className={className} />;
}

export default function IntelligenceLanding() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All categories");
  const [type, setType] = useState("All publication types");
  const [industry, setIndustry] = useState("All industries");
  const [market, setMarket] = useState("All markets");

  useEffect(() => {
    fetch("/api/blog/list", { cache: "no-store" }).then((response) => response.json())
      .then((json) => setPosts(json.posts || [])).catch(() => setPosts([])).finally(() => setLoading(false));
  }, []);

  const options = useMemo(() => ({
    categories: [...new Set(posts.map((post) => post.category).filter(Boolean))].sort(),
    types: [...new Set(posts.map((post) => post.publication_type).filter(Boolean))].sort(),
    industries: [...new Set(posts.map((post) => post.industry).filter(Boolean) as string[])].sort(),
    markets: [...new Set(posts.map((post) => post.country).filter(Boolean) as string[])].sort(),
  }), [posts]);
  const activeFilters = [category !== "All categories", type !== "All publication types", industry !== "All industries", market !== "All markets"].filter(Boolean).length;
  const filtered = useMemo(() => {
    return posts.filter((post) => {
      return (category === "All categories" || post.category === category) && (type === "All publication types" || post.publication_type === type) && (industry === "All industries" || post.industry === industry) && (market === "All markets" || post.country === market);
    });
  }, [posts, category, type, industry, market]);
  const featured = posts.find((post) => post.featured) || posts[0] || null;
  const library = activeFilters === 0 && featured ? filtered.filter((post) => post.id !== featured.id) : filtered;
  const marketCount = new Set(posts.map((post) => post.country).filter(Boolean)).size;

  function clear() { setCategory("All categories"); setType("All publication types"); setIndustry("All industries"); setMarket("All markets"); }

  return <main className="min-h-screen bg-[#F7F9FD] selection:bg-brand-blue selection:text-white">
    <section className="relative overflow-hidden border-b border-brand-stroke bg-brand-bg px-4 pb-20 pt-[132px] sm:px-6 md:pb-24 md:pt-[174px] lg:px-10">
      <div className="pointer-events-none absolute -left-20 top-24 size-52 rounded-full bg-brand-blue/10 blur-[90px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 bottom-0 size-64 rounded-full bg-[#8CB2FF]/10 blur-[110px]" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-[8px] border border-white bg-[#E6EBF7] px-3 py-2 text-[14px] font-semibold text-brand-body"><BarChart3 className="size-4 text-brand-blue" /><span>CDS Space</span><span className="size-2 rounded-full bg-emerald-600" aria-hidden="true" /><span className="font-medium">Independent research and analysis</span></div>
        <h1 className="mt-8 max-w-[900px] text-balance text-[38px] font-semibold leading-[1.1] tracking-[-.04em] text-brand-navy sm:text-[52px] lg:text-[64px]">CDS Space Intelligence</h1>
        <p className="mt-6 max-w-[680px] text-pretty text-[16px] font-medium leading-7 text-brand-body sm:text-[19px]">Research, audits, and market insights for businesses building the future.</p>
        <dl className="mt-10 grid w-full max-w-[620px] grid-cols-3 overflow-hidden rounded-[12px] border border-brand-stroke bg-white/90 shadow-[0_18px_48px_rgba(4,11,55,.06)]"><div className="p-4 sm:p-5"><dt className="text-[24px] font-bold text-brand-navy">{posts.length}</dt><dd className="mt-1 text-[9px] uppercase tracking-[.12em] text-brand-body/55 sm:text-[10px]">Publications</dd></div><div className="border-x border-brand-stroke p-4 sm:p-5"><dt className="text-[24px] font-bold text-brand-navy">{options.types.length}</dt><dd className="mt-1 text-[9px] uppercase tracking-[.12em] text-brand-body/55 sm:text-[10px]">Research types</dd></div><div className="p-4 sm:p-5"><dt className="text-[24px] font-bold text-brand-navy">{marketCount}</dt><dd className="mt-1 text-[9px] uppercase tracking-[.12em] text-brand-body/55 sm:text-[10px]">Markets</dd></div></dl>
      </div>
    </section>

    <section className="relative z-10 mx-auto -mt-6 max-w-[1200px] px-4 sm:px-6 lg:px-10" aria-label="Filter research">
      <div className="rounded-[16px] border border-brand-stroke bg-white p-4 shadow-[0_20px_55px_rgba(4,11,55,.08)] sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[
          [category, setCategory, ["All categories", ...options.categories], "Category"],
          [type, setType, ["All publication types", ...options.types], "Publication type"],
          [industry, setIndustry, ["All industries", ...options.industries], "Industry"],
          [market, setMarket, ["All markets", ...options.markets], "Market"],
        ].map(([value, setter, values, label]) => <label key={String(label)} className="sr-only-wrapper"><span className="sr-only">{String(label)}</span><select value={value as string} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)} className="h-10 w-full rounded-[8px] border border-brand-stroke bg-white px-3 text-[11px] font-medium text-brand-body outline-none focus:border-brand-blue">{(values as string[]).map((option) => <option key={option}>{option}</option>)}</select></label>)}
        </div>
      </div>
    </section>

    <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-12 sm:px-6 lg:px-10">
      {loading ? <div className="grid min-h-[360px] place-items-center"><Loader2 className="size-7 animate-spin text-brand-blue" /></div> : posts.length === 0 ? <div className="rounded-[16px] border border-brand-stroke bg-white px-6 py-20 text-center"><FileSearch className="mx-auto size-10 text-brand-stroke" /><p className="mt-5 text-[17px] font-semibold text-brand-navy">Research is being prepared</p><p className="mt-2 text-[13px] text-brand-body/65">The first CDS Space Intelligence publication will appear here.</p></div> : <>
        {activeFilters === 0 && featured && <section className="mb-16" aria-labelledby="featured-intelligence"><div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-brand-blue">Editor&apos;s selection</p><h2 id="featured-intelligence" className="mt-1 text-[24px] font-bold text-brand-navy">Featured intelligence</h2></div></div><Link href={`/intelligence/${featured.slug}`} className="group grid overflow-hidden rounded-[16px] border border-brand-stroke bg-white shadow-[0_24px_70px_rgba(4,11,55,.07)] lg:grid-cols-[1.08fr_.92fr]"><div className="h-[280px] overflow-hidden lg:h-[430px]"><Cover post={featured} eager className="transition duration-700 group-hover:scale-[1.025]" /></div><div className="flex flex-col justify-center p-7 sm:p-10"><div className="flex flex-wrap gap-2"><span className="rounded-[4px] bg-[#EAF1FF] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-brand-blue">{featured.publication_type}</span>{featured.country && <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#F2F4F8] px-2.5 py-1 text-[9px] font-semibold text-brand-body"><Globe2 className="size-3" />{featured.country}</span>}</div><h3 className="mt-5 text-balance text-[28px] font-bold leading-[1.13] tracking-[-.025em] text-brand-navy transition group-hover:text-brand-blue sm:text-[36px]">{featured.title}</h3>{featured.excerpt && <p className="mt-4 line-clamp-3 text-[14px] leading-6 text-brand-body/75">{featured.excerpt}</p>}<div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-brand-body/55">{featured.author_name && <span className="font-bold text-brand-navy">{featured.author_name}</span>}<span className="inline-flex items-center gap-1"><Calendar className="size-3" />{fmtDate(featured.published_at)}</span><span className="inline-flex items-center gap-1"><Clock className="size-3" />{featured.reading_time} min</span><span className="inline-flex items-center gap-1"><Eye className="size-3" />{featured.views.toLocaleString()}</span></div><span className="mt-7 inline-flex items-center gap-2 text-[13px] font-bold text-brand-blue">Open publication <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span></div></Link></section>}

        <section aria-labelledby="intelligence-library"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-brand-blue">Knowledge library</p><h2 id="intelligence-library" className="mt-1 text-[26px] font-bold text-brand-navy">{activeFilters ? `${filtered.length} matching publication${filtered.length === 1 ? "" : "s"}` : "Latest research"}</h2></div>{activeFilters > 0 && <button onClick={clear} className="inline-flex items-center gap-1.5 rounded-[8px] border border-brand-stroke bg-white px-3 py-2 text-[11px] font-semibold text-brand-body"><X className="size-3.5" />Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}</button>}</div>
          {library.length === 0 ? <div className="rounded-[16px] border border-dashed border-brand-stroke py-16 text-center"><Search className="mx-auto size-7 text-brand-stroke" /><p className="mt-3 text-[13px] font-semibold text-brand-navy">No research matches these filters</p><button onClick={clear} className="mt-3 text-[11px] font-semibold text-brand-blue">Reset filters</button></div> : <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{library.map((post, index) => <motion.div key={post.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (index % 3) * .04 }}><Link href={`/intelligence/${post.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[12px] border border-brand-stroke bg-white transition hover:-translate-y-0.5 hover:border-brand-blue/35 hover:shadow-[0_18px_45px_rgba(4,11,55,.08)]"><div className="h-48 overflow-hidden"><Cover post={post} className="transition duration-500 group-hover:scale-[1.03]" /></div><div className="flex flex-1 flex-col p-5"><div className="flex flex-wrap gap-1.5"><span className="rounded-[4px] bg-[#EAF1FF] px-2 py-1 text-[8px] font-bold uppercase tracking-[.1em] text-brand-blue">{post.publication_type}</span>{post.industry && <span className="rounded-[4px] bg-[#F2F4F8] px-2 py-1 text-[8px] font-semibold text-brand-body">{post.industry}</span>}</div><h3 className="mt-4 line-clamp-2 text-[18px] font-bold leading-snug text-brand-navy transition group-hover:text-brand-blue">{post.title}</h3>{post.excerpt && <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-brand-body/70">{post.excerpt}</p>}<div className="mt-auto pt-5"><div className="flex items-center justify-between border-t border-brand-stroke pt-4 text-[9px] text-brand-body/50"><span>{post.author_name || "CDS Space Research"}</span><span>{fmtDate(post.published_at)}</span></div><div className="mt-3 flex items-center gap-3 text-[9px] text-brand-body/50"><span className="inline-flex items-center gap-1"><Clock className="size-3" />{post.reading_time}m</span><span className="inline-flex items-center gap-1"><Eye className="size-3" />{post.views}</span><span className="inline-flex items-center gap-1"><Heart className="size-3" />{post.likes_count + post.loves_count}</span></div></div></div></Link></motion.div>)}</div>}
        </section>
      </>}
    </div>
  </main>;
}
