"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, Linkedin, Facebook, Link2, Check, MessageCircle, Send } from "lucide-react";
import { appToast } from "@/lib/app-notify";

interface Props {
  slug: string;
  title: string;
  url: string;
  initialLikes: number;
  initialDislikes: number;
  sharingEnabled: boolean;
  reactionsEnabled: boolean;
}

export default function PostInteractions({ slug, title, url, initialLikes, initialDislikes, sharingEnabled, reactionsEnabled }: Props) {
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [mine, setMine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!reactionsEnabled) return;
    fetch(`/api/blog/like?slug=${encodeURIComponent(slug)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => setMine(j.mine ?? null))
      .catch(() => {});
  }, [slug, reactionsEnabled]);

  async function react(value: 1 | -1) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/blog/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug, value }),
      });
      const json = await res.json();
      if (res.status === 401) { appToast("Sign in to react to articles."); return; }
      if (!res.ok || !json.ok) { appToast(json.error || "Could not react."); return; }
      setLikes(json.likes); setDislikes(json.dislikes); setMine(json.mine);
    } finally {
      setBusy(false);
    }
  }

  const shares: { label: string; icon: React.ReactNode; href?: string; onClick?: () => void }[] = [
    { label: "LinkedIn", icon: <Linkedin className="h-4 w-4" />, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: "Facebook", icon: <Facebook className="h-4 w-4" />, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label: "X", icon: <span className="text-[13px] font-bold leading-none">X</span>, href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
    { label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" />, href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { label: "Telegram", icon: <Send className="h-4 w-4" />, href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      appToast("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      appToast("Could not copy link");
    }
  }

  return (
    <div className="flex flex-col gap-5 border-y border-brand-stroke/60 py-6">
      {reactionsEnabled && (
        <div className="flex items-center gap-3">
          <button onClick={() => react(1)} disabled={busy}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition ${mine === 1 ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-brand-stroke text-brand-body hover:border-brand-blue/50"}`}>
            <ThumbsUp className="h-4 w-4" /> {likes}
          </button>
          <button onClick={() => react(-1)} disabled={busy}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition ${mine === -1 ? "border-rose-300 bg-rose-50 text-rose-600" : "border-brand-stroke text-brand-body hover:border-rose-300"}`}>
            <ThumbsDown className="h-4 w-4" /> {dislikes}
          </button>
        </div>
      )}

      {sharingEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[12px] font-semibold uppercase tracking-wider text-brand-body/50">Share</span>
          {shares.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" title={`Share on ${s.label}`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-stroke text-brand-body transition hover:border-brand-blue/50 hover:text-brand-blue">
              {s.icon}
            </a>
          ))}
          <button onClick={copyLink} title="Copy link"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-stroke text-brand-body transition hover:border-brand-blue/50 hover:text-brand-blue">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
