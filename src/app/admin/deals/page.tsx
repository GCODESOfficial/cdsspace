"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileText, Loader2, Rocket, ShieldCheck, UsersRound } from "lucide-react";

const tools = [
  { href: "/admin/deals/growth", title: "Growth Engine", description: "Find public buying signals, research prospects globally, and prepare human-approved outreach.", icon: Rocket, metric: "growth_prospects" },
  { href: "/admin/deals/proposals", title: "Proposals", description: "Create editable, evidence-led proposals and send a branded link or PDF.", icon: FileText, metric: "proposals" },
  { href: "/admin/deals/brand-audits", title: "Brand audits", description: "Assess identity, messaging, consistency, and digital experience using public evidence.", icon: ClipboardCheck, metric: "audits" },
  { href: "/admin/deals/prospects", title: "Prospect checklist", description: "Organise potential clients, investors, influencers, and industry leaders for follow-up.", icon: UsersRound, metric: "checklist" },
] as const;

export default function DealsOverviewPage() {
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/deals?resource=overview", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "Could not load Deals.");
        setMetrics(json.metrics || {});
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load Deals."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-[1400px] p-4 sm:p-7 lg:p-9">
      <header className="rounded-[28px] bg-[#0A4FE8] px-6 py-9 text-white shadow-[0_20px_60px_rgba(10,79,232,0.18)] sm:px-10">
        <div className="flex max-w-3xl items-center gap-2 text-sm font-semibold text-blue-100"><ShieldCheck className="h-4 w-4" /> Public-source prospecting with human approval</div>
        <h1 className="mt-3 text-3xl font-bold sm:text-5xl">Deals</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-blue-100 sm:text-base">Find the right opportunities, understand the brand problem, prepare a credible response, and keep every follow-up visible in one workspace.</p>
      </header>

      {error && <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      <section className="mt-6 grid gap-5 md:grid-cols-2">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href} className="group rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><tool.icon className="h-5 w-5" /></div>
              <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#0A4FE8]" />
            </div>
            <div className="mt-7 flex items-end justify-between gap-4">
              <div><h2 className="text-xl font-bold text-[#07133B]">{tool.title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{tool.description}</p></div>
              <div className="shrink-0 text-right"><span className="block text-2xl font-bold text-[#07133B]">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : metrics[tool.metric] || 0}</span><span className="text-xs text-slate-400">records</span></div>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-6 rounded-[24px] border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="text-lg font-bold text-[#07133B]">Responsible prospecting controls</h2>
        <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-500 md:grid-cols-3">
          <p><strong className="block text-[#07133B]">Public evidence only</strong> Research is limited to publicly accessible business information and recorded source links.</p>
          <p><strong className="block text-[#07133B]">No fabricated metrics</strong> Market figures appear only when the exact claim is supported by a captured source.</p>
          <p><strong className="block text-[#07133B]">Human-controlled outreach</strong> A team member reviews the target, message, and recipient before anything is sent.</p>
        </div>
      </section>
    </main>
  );
}
