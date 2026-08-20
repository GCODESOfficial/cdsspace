"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, Heart } from "lucide-react";
import { appToast } from "@/lib/app-notify";
import { trackPublicationEvent } from "@/components/intelligence/PublicationTracker";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";

interface Props {
  slug: string;
  title: string;
  url: string;
  initialLikes: number;
  initialLoves: number;
  sharingEnabled: boolean;
  reactionsEnabled: boolean;
}

export default function PostInteractions({ slug, title, url, initialLikes, initialLoves, sharingEnabled, reactionsEnabled }: Props) {
  const [likes, setLikes] = useState(initialLikes);
  const [loves, setLoves] = useState(initialLoves);
  const [mine, setMine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!reactionsEnabled) return;
    fetch(`/api/blog/like?slug=${encodeURIComponent(slug)}`, { cache: "no-store", credentials: "include" })
      .then((response) => response.json()).then((json) => setMine(json.mine ?? null)).catch(() => {});
  }, [slug, reactionsEnabled]);

  async function react(value: 1 | 2) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/blog/like", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ slug, value }) });
      const json = await response.json();
      if (response.status === 401) { appToast("Sign in to react to this publication."); return; }
      if (!response.ok || !json.ok) { appToast(json.error || "Could not react."); return; }
      setLikes(Number(json.likes ?? 0)); setLoves(Number(json.loves ?? 0)); setMine(json.mine);
      trackPublicationEvent(slug, "reaction", value, { active: json.mine === value });
    } finally { setBusy(false); }
  }

  function recordShare(channel: string) { trackPublicationEvent(slug, "share", undefined, { channel }); }

  return <div className="flex flex-col gap-5 border-y border-brand-stroke/60 py-6">
    {reactionsEnabled && <div><p className="mb-3 text-[12px] font-semibold text-brand-navy">Was this research useful?</p><div className="flex items-center gap-3">
      <button onClick={() => react(1)} disabled={busy} aria-pressed={mine === 1} className={`inline-flex items-center gap-2 rounded-[8px] border px-4 py-2.5 text-[13px] font-semibold transition ${mine === 1 ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-brand-stroke text-brand-body hover:border-brand-blue/50"}`}><ThumbsUp className="size-4" />Like <span aria-live="polite" className="text-[11px] opacity-70">{likes}</span></button>
      <button onClick={() => react(2)} disabled={busy} aria-pressed={mine === 2} className={`inline-flex items-center gap-2 rounded-[8px] border px-4 py-2.5 text-[13px] font-semibold transition ${mine === 2 ? "border-rose-300 bg-rose-50 text-rose-600" : "border-brand-stroke text-brand-body hover:border-rose-300"}`}><Heart className="size-4" />Love <span aria-live="polite" className="text-[11px] opacity-70">{loves}</span></button>
    </div></div>}
    {sharingEnabled && <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[11px] font-semibold uppercase tracking-[.12em] text-brand-body/50">Share research</span><UniversalShareButton title={title} text={`Read ${title} on CDS Space Intelligence.`} url={url} className="min-h-9 rounded-[8px] px-3 py-2" onChannel={(channel) => recordShare(channel)} /></div>}
  </div>;
}
