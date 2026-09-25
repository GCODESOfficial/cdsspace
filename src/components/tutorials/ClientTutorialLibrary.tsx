"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Loader2, PlayCircle, Search } from "lucide-react";
import { TutorialVideoPlayer, type TutorialPlayerItem } from "@/components/tutorials/TutorialVideoPlayer";

type Tutorial = TutorialPlayerItem & { openedAt: string | null; completedAt: string | null; updatedAt: string; };

const TOOL_LABELS: Record<string, string> = {
  "official-letterhead": "Create letterhead", "create-studio": "Create Studio", cdrive: "cDrive",
  chat: "Chat", cmeet: "cMeet", "brand-brief": "Brand brief", "brand-identity": "Brand identity",
  banners: "Banners", merch: "Merch", invoices: "Invoices",
};

export function ClientTutorialLibrary({ compact = false, tool }: { compact?: boolean; tool?: string }) {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [active, setActive] = useState<Tutorial | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/client/tutorials${tool ? `?tool=${encodeURIComponent(tool)}` : ""}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("Tutorials could not be loaded.")))
      .then((payload) => { if (!cancelled) setTutorials(payload.tutorials || []); })
      .catch(() => undefined).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tool]);

  const filtered = useMemo(() => tutorials.filter((tutorial) => `${tutorial.title} ${tutorial.description} ${TOOL_LABELS[tutorial.toolSlug] || tutorial.toolSlug}`.toLowerCase().includes(query.toLowerCase())), [query, tutorials]);

  function report(tutorial: Tutorial, position: number, completed: boolean) {
    void fetch("/api/client/tutorials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tutorialId: tutorial.id, positionSeconds: position, completed }) });
    setTutorials((current) => current.map((item) => item.id === tutorial.id ? { ...item, openedAt: item.openedAt || new Date().toISOString(), completedAt: completed ? new Date().toISOString() : item.completedAt, lastPositionSeconds: position } : item));
  }

  if (loading) return <div className="grid min-h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>;
  if (compact && !tutorials.length) return null;

  return (
    <div className="space-y-5">
      {active && <TutorialVideoPlayer tutorial={active} onClose={() => setActive(null)} onProgress={(position, completed) => report(active, position, completed)} />}
      {!compact && <div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tutorials or tools" className="h-11 w-full rounded-xl border border-[#DCE5F5] bg-white pl-10 pr-3 text-[13px] outline-none focus:border-[#0A4FE8]" /></div>}
      {filtered.length ? <div className={`grid gap-4 ${compact ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 2xl:grid-cols-3"}`}>
        {filtered.slice(0, compact ? 3 : undefined).map((tutorial) => (
          <article key={tutorial.id} className="overflow-hidden rounded-2xl border border-[#DCE5F5] bg-white shadow-sm">
            <button type="button" onClick={() => { setActive(tutorial); report(tutorial, tutorial.lastPositionSeconds || 0, false); }} className="group grid aspect-video w-full place-items-center bg-[#07133B] text-white">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[#0A4FE8] transition group-hover:scale-105"><PlayCircle className="h-7 w-7" /></span>
            </button>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-[#0A4FE8]">{TOOL_LABELS[tutorial.toolSlug] || tutorial.toolSlug}</span>{tutorial.completedAt && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Watched</span>}</div>
              <h2 className="mt-3 text-[15px] font-semibold text-[#07133B]">{tutorial.title}</h2>
              <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#667085]">{tutorial.description}</p>
              <p className="mt-3 text-[10.5px] text-gray-400">{tutorial.media.length} audio {tutorial.media.length === 1 ? "language" : "languages"}</p>
            </div>
          </article>
        ))}
      </div> : <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-[#DCE5F5] bg-white text-center"><div><BookOpen className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-3 text-sm font-semibold text-[#07133B]">No tutorials found</p><p className="mt-1 text-[12px] text-gray-400">Published help videos will appear here.</p></div></div>}
    </div>
  );
}
