"use client";

import { ArrowRight } from "lucide-react";
import { trackPublicationEvent } from "./PublicationTracker";

export default function PublicationCta({ slug, title, supportingLine, href }: { slug: string; title: string; supportingLine?: string | null; href: string }) {
  return <aside className="mt-12 overflow-hidden rounded-[16px] bg-[#07123F] p-6 text-white sm:p-8">
    <div className="max-w-[640px]"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#82AFFF]">Continue with CDS Space</p><h2 className="mt-3 text-[24px] font-bold leading-tight sm:text-[30px]">{title}</h2>{supportingLine && <p className="mt-3 text-[14px] leading-6 text-white/70">{supportingLine}</p>}<a href={href} onClick={() => trackPublicationEvent(slug, "cta_click", undefined, { href })} className="mt-6 inline-flex items-center gap-2 rounded-[8px] bg-[#0A66FF] px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-[#2378ff]">Get started <ArrowRight className="size-4" /></a></div>
  </aside>;
}
