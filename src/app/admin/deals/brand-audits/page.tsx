/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";

type AuditContent = {
  summary: string;
  scores: Array<{ area: string; score: number; explanation: string }>;
  findings: Array<{ title: string; severity: "high" | "medium" | "low"; evidence: string; source_url: string }>;
  recommendations: Array<{ priority: number; title: string; action: string; expected_outcome: string }>;
  future_state: string;
  metrics: Array<{ label: string; value: number; maximum: number }>;
};
type Audit = { id: string; brand_name: string; target_url: string; social_url: string | null; overall_score: number; status: string; content: AuditContent; sources: Array<{ title?: string; url: string }>; updated_at: string };

export default function DealBrandAuditsPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ brand_name: "", target_url: "", social_url: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const selected = useMemo(() => audits.find((item) => item.id === selectedId) || null, [audits, selectedId]);

  useEffect(() => {
    fetch("/api/admin/deals?resource=audits", { cache: "no-store" }).then(async (response) => {
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Could not load brand audits.");
      setAudits(json.audits || []); setSelectedId(json.audits?.[0]?.id || "");
    }).catch((error) => setNotice({ tone: "error", text: error.message })).finally(() => setLoading(false));
  }, []);

  const generate = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate_audit", ...form }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "The brand audit could not be generated.");
      setAudits((items) => [json.audit, ...items]); setSelectedId(json.audit.id); setForm({ brand_name: "", target_url: "", social_url: "" });
      setNotice({ tone: "success", text: "Brand audit generated from captured public evidence." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The brand audit could not be generated." }); }
    finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-[1500px] p-4 sm:p-7">
      <header className="mb-6"><p className="text-sm font-semibold text-[#0A4FE8]">Deals</p><h1 className="mt-1 text-3xl font-bold text-[#07133B]">Brand audits</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Review public identity, messaging, consistency, and digital-experience signals with evidence-linked findings and priorities.</p></header>
      {notice && <div className={`mb-5 rounded-2xl border p-4 text-sm ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}
      <form onSubmit={generate} className="mb-6 grid gap-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7 md:grid-cols-3">
        <Field label="Brand name" required value={form.brand_name} onChange={(value) => setForm({ ...form, brand_name: value })} />
        <Field label="Public website" required type="url" placeholder="https://example.com" value={form.target_url} onChange={(value) => setForm({ ...form, target_url: value })} />
        <Field label="Social media link" type="url" placeholder="Optional" value={form.social_url} onChange={(value) => setForm({ ...form, social_url: value })} />
        <button disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white md:col-span-3 md:justify-self-start disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Research and generate audit</button>
      </form>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-5">
          <div className="px-3 pb-3 text-sm font-bold text-[#07133B]">Saved audits</div>
          {loading ? <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div> : audits.length === 0 ? <p className="p-4 text-sm text-slate-400">No brand audits yet.</p> : <div className="space-y-1.5">{audits.map((audit) => <button key={audit.id} onClick={() => setSelectedId(audit.id)} className={`flex w-full items-center justify-between gap-3 rounded-2xl p-3 text-left ${audit.id === selectedId ? "bg-[#0A4FE8] text-white" : "hover:bg-slate-50"}`}><span className="min-w-0 truncate text-sm font-semibold">{audit.brand_name}</span><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${audit.id === selectedId ? "bg-white/15" : "bg-blue-50 text-[#0A4FE8]"}`}>{audit.overall_score}</span></button>)}</div>}
        </aside>

        {selected ? <AuditReport audit={selected} /> : <section className="grid min-h-80 place-items-center rounded-[24px] border border-dashed border-slate-200 bg-white text-sm text-slate-400">Select or generate an audit.</section>}
      </div>
    </main>
  );
}

function AuditReport({ audit }: { audit: Audit }) {
  const content = audit.content;
  return <section className="min-w-0 space-y-5">
    <div className="rounded-[24px] bg-[#0A4FE8] p-6 text-white shadow-[0_18px_50px_rgba(10,79,232,0.16)] sm:p-8"><div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-blue-100">Evidence-led public brand audit</p><h2 className="mt-2 text-3xl font-bold">{audit.brand_name}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100">{content.summary}</p></div><div className="grid h-28 w-28 shrink-0 place-items-center rounded-full border-8 border-white/25 bg-white/10"><div className="text-center"><strong className="block text-3xl">{audit.overall_score}</strong><span className="text-xs text-blue-100">out of 100</span></div></div></div></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold text-[#07133B]">Scorecard</h3><div className="mt-5 space-y-5">{content.scores.map((item) => <div key={item.area}><div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-[#07133B]">{item.area}</span><span className="text-sm font-bold text-[#0A4FE8]">{item.score}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0A4FE8]" style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }} /></div><p className="mt-2 text-xs leading-5 text-slate-500">{item.explanation}</p></div>)}</div></div>
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold text-[#07133B]">What it can become</h3><p className="mt-4 text-sm leading-7 text-slate-600">{content.future_state}</p><div className="mt-6 grid grid-cols-2 gap-3">{content.metrics.slice(0, 6).map((metric) => <div key={metric.label} className="rounded-2xl bg-[#F3F6FC] p-4"><strong className="text-2xl text-[#0A4FE8]">{metric.value}</strong><span className="block text-xs text-slate-500">{metric.label}</span></div>)}</div></div>
    </div>
    <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold text-[#07133B]">Findings</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{content.findings.map((finding, index) => <a key={`${finding.title}-${index}`} href={finding.source_url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold text-[#07133B]">{finding.title}</h4><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${finding.severity === "high" ? "bg-rose-50 text-rose-700" : finding.severity === "medium" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{finding.severity}</span></div><p className="mt-2 text-sm leading-6 text-slate-500">{finding.evidence}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0A4FE8]"><ExternalLink className="h-3 w-3" /> Source</span></a>)}</div></div>
    <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold text-[#07133B]">Priority actions</h3><div className="mt-4 space-y-3">{[...content.recommendations].sort((a, b) => a.priority - b.priority).map((item) => <div key={`${item.priority}-${item.title}`} className="flex gap-4 rounded-2xl bg-[#F3F6FC] p-4"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#0A4FE8] text-xs font-bold text-white">{item.priority}</div><div><h4 className="font-semibold text-[#07133B]">{item.title}</h4><p className="mt-1 text-sm text-slate-600">{item.action}</p><p className="mt-2 text-xs text-slate-400">Expected outcome: {item.expected_outcome}</p></div></div>)}</div></div>
  </section>;
}

function Field({ label, value, onChange, type = "text", placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>;
}
