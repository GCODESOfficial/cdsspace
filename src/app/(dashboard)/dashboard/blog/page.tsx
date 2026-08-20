"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, ArrowRight, Loader2, Library, ShieldCheck } from "lucide-react";
import type { BlogPost } from "@/lib/blog/constants";

function fmtDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DashboardIntelligencePage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");

  useEffect(() => {
    fetch("/api/intelligence/library", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => setPosts(j.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const present = new Set(posts.map((p) => p.category).filter(Boolean));
    return ["All", ...Array.from(present).sort((a, b) => a.localeCompare(b))];
  }, [posts]);

  const filtered = useMemo(() => {
    return posts.filter((p) => category === "All" || p.category === category);
  }, [posts, category]);

  return (
    <div className="p-5 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-[24px] font-bold text-[#0D1B39]">
            <Library className="h-6 w-6 text-[#0A4FE8]" /> CDS Space Intelligence
          </h1>
          <p className="mt-1 text-sm text-gray-500">Research, audits, and market insights for businesses building the future.</p>
        </div>
      </div>

      {!loading && posts.length > 0 && (
        <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${
                category === c ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:text-[#0A4FE8]"
              }`}>
              {c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white/70 px-6 py-20 text-center">
          <Library className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-[15px] font-semibold text-[#0D1B39]">{posts.length === 0 ? "No articles yet" : "No articles match this filter"}</p>
          <p className="mt-1 text-sm text-gray-500">{posts.length === 0 ? "New insights are on the way - check back soon." : "Try another category."}</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <Link key={p.id} href={`/intelligence/${p.slug}`}
              className="group flex h-full flex-col overflow-hidden rounded-[12px] border border-gray-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-[0_18px_40px_rgba(15,40,90,0.10)]">
              {p.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.cover_url} alt={p.title} className="h-40 w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-[#040B37] text-sm font-semibold text-white/30">CDS Space</div>
              )}
              <div className="flex flex-1 flex-col gap-2.5 p-5">
                <div className="flex flex-wrap gap-2"><span className="w-fit rounded-[4px] bg-blue-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.08em] text-[#0A4FE8]">{p.publication_type}</span>{p.access_level === "private_client" && <span className="inline-flex items-center gap-1 rounded-[4px] bg-violet-50 px-2 py-1 text-[9px] font-semibold text-violet-700"><ShieldCheck className="size-3" />Private assessment</span>}</div>
                <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-[#0D1B39] transition group-hover:text-[#0A4FE8]">{p.title}</h3>
                {p.excerpt && <p className="line-clamp-2 text-[13px] leading-relaxed text-gray-500">{p.excerpt}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] text-gray-400">
                  {p.author_name && <span className="font-medium text-gray-600">{p.author_name}</span>}
                  <span>{fmtDate(p.published_at)}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{p.reading_time}m</span>
                </div>
                <span className="inline-flex items-center gap-1.5 pt-1 text-[13px] font-semibold text-[#0A4FE8]">Read <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
