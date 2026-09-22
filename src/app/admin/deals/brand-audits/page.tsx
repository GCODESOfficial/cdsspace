/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy, Download, ExternalLink, FileText, Link2, Loader2, Pencil, RefreshCw, Search, Share2, Trash2, X,
} from "lucide-react";
import { appConfirm } from "@/lib/app-notify";
import AuditReport from "@/components/deals/AuditReport";
import type { DealAuditContent, DealAuditTouchpoint } from "@/lib/deals-ai";

type Audit = {
  id: string; public_token: string; brand_name: string; target_url: string; social_url: string | null;
  overall_score: number; status: string; content: DealAuditContent; sources: Array<{ title?: string; url: string }>;
  share_enabled: boolean; refined_count: number; view_count: number; last_viewed_at: string | null;
  prospect_id: string | null; company_id: string | null; updated_at: string;
};

const STATES: Array<DealAuditTouchpoint["state"]> = ["strong", "adequate", "weak", "missing", "unknown"];

function when(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

export default function DealBrandAuditsPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ brand_name: "", target_url: "", social_url: "" });
  const [tab, setTab] = useState<"report" | "edit" | "share">("report");
  const [draft, setDraft] = useState<DealAuditContent | null>(null);
  const [refineNote, setRefineNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const router = useRouter();
  const selected = useMemo(() => audits.find((item) => item.id === selectedId) || null, [audits, selectedId]);
  const shareUrl = selected ? `${typeof window === "undefined" ? "" : window.location.origin}/audit/${selected.public_token}` : "";

  const load = async () => {
    const response = await fetch("/api/admin/deals?resource=audits", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load brand audits.");
    setAudits(json.audits || []);
    // ?audit=<id> lets prospect generation hand a freshly run audit straight over.
    const requested = new URLSearchParams(window.location.search).get("audit") || "";
    const exists = (json.audits || []).some((item: any) => item.id === requested);
    setSelectedId((current) => (exists ? requested : current || json.audits?.[0]?.id || ""));
  };

  useEffect(() => {
    load().catch((error) => setNotice({ tone: "error", text: error.message })).finally(() => setLoading(false));
  }, []);

  // The editor is a copy: nothing is written until Save is pressed, so an
  // abandoned edit never touches the audit the client can already read.
  useEffect(() => {
    setDraft(selected ? JSON.parse(JSON.stringify(selected.content || {})) : null);
    setRefineNote("");
    setTab("report");
    setCopied(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (payload: Record<string, unknown>, label: string) => {
    setBusy(label); setNotice(null);
    try {
      const response = await fetch("/api/admin/deals", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "The request could not be completed.");
      return json;
    } finally { setBusy(""); }
  };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault(); setNotice({ tone: "success", text: "Researching every touchpoint. This takes a moment." });
    try {
      const json = await post({ action: "generate_audit", ...form }, "generate");
      setAudits((items) => [json.audit, ...items]);
      setSelectedId(json.audit.id);
      setForm({ brand_name: "", target_url: "", social_url: "" });
      setNotice({ tone: "success", text: "Brand audit generated from captured public evidence." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The brand audit could not be generated." }); }
  };

  const replace = (audit: Audit) => setAudits((items) => items.map((item) => (item.id === audit.id ? audit : item)));

  const refine = async () => {
    if (!selected || !refineNote.trim()) return;
    try {
      const json = await post({ action: "refine_audit", id: selected.id, note: refineNote }, "refine");
      replace(json.audit); setDraft(JSON.parse(JSON.stringify(json.audit.content || {}))); setRefineNote("");
      setNotice({ tone: "success", text: "Audit refined against the evidence and your note." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The audit could not be refined." }); }
  };

  const saveEdits = async () => {
    if (!selected || !draft) return;
    try {
      const json = await post({ action: "save_audit", id: selected.id, brand_name: selected.brand_name, content: draft }, "save");
      replace(json.audit);
      setNotice({ tone: "success", text: "Audit saved." });
      setTab("report");
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The audit could not be saved." }); }
  };

  const setShare = async (enabled: boolean) => {
    if (!selected) return;
    try {
      const json = await post({ action: "set_audit_share", id: selected.id, share_enabled: enabled }, "share");
      replace(json.audit);
      setNotice({ tone: "success", text: enabled ? "The share link is live." : "The share link has been switched off." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The share setting could not be changed." }); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setNotice({ tone: "error", text: "The link could not be copied. Select it and copy manually." }); }
  };

  /**
   * The audit has already argued the case, so the proposal opens from its own
   * summary and the actions it ranked first, and the two stay linked.
   */
  const draftProposal = async () => {
    if (!selected) return;
    setNotice({ tone: "success", text: `Writing a proposal from the ${selected.brand_name} audit. This takes a moment.` });
    try {
      const json = await post({ action: "generate_proposal", audit_id: selected.id }, "proposal");
      const proposalId = typeof json.proposal?.id === "string" ? json.proposal.id : "";
      if (!proposalId) throw new Error("The proposal finished without an ID.");
      router.push(`/admin/deals/proposals?proposal=${encodeURIComponent(proposalId)}`);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The proposal could not be generated." });
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!(await appConfirm({ title: "Delete audit?", message: `Delete the ${selected.brand_name} brand audit permanently?`, confirmLabel: "Delete" }))) return;
    try {
      await post({ action: "delete_audit", id: selected.id }, "delete");
      setAudits((items) => items.filter((item) => item.id !== selected.id));
      setSelectedId("");
      setNotice({ tone: "success", text: "Audit deleted." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The audit could not be deleted." }); }
  };

  const patch = (fields: Partial<DealAuditContent>) => setDraft((current) => (current ? { ...current, ...fields } : current));
  const patchTouchpoint = (index: number, fields: Partial<DealAuditTouchpoint>) =>
    setDraft((current) => (current ? { ...current, touchpoints: (current.touchpoints || []).map((entry, position) => (position === index ? { ...entry, ...fields } : entry)) } : current));

  return (
    <main className="mx-auto max-w-[1500px] p-4 sm:p-7">
      <header className="mb-6">
        <p className="text-sm font-semibold text-[#0A4FE8]">Deals</p>
        <h1 className="mt-1 text-3xl font-bold text-[#07133B]">Brand audits</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Every brand touchpoint diagnosed from public evidence, refined and edited by us, then sent to the client as a link or a PDF.</p>
      </header>
      {notice && <div className={`mb-5 rounded-2xl border p-4 text-sm ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

      <form onSubmit={generate} className="mb-6 grid gap-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7 md:grid-cols-3">
        <Field label="Brand name" required value={form.brand_name} onChange={(value) => setForm({ ...form, brand_name: value })} />
        <Field label="Public website" required type="url" placeholder="https://example.com" value={form.target_url} onChange={(value) => setForm({ ...form, target_url: value })} />
        <Field label="Social media link" type="url" placeholder="Optional" value={form.social_url} onChange={(value) => setForm({ ...form, social_url: value })} />
        <button disabled={busy === "generate"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white md:col-span-3 md:justify-self-start disabled:opacity-60">
          {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Research and generate audit
        </button>
      </form>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-5">
          <div className="px-3 pb-3 text-sm font-bold text-[#07133B]">Saved audits</div>
          {loading ? (
            <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div>
          ) : audits.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">No brand audits yet.</p>
          ) : (
            <div className="max-h-[70vh] space-y-1.5 overflow-y-auto">
              {audits.map((audit) => (
                <button key={audit.id} onClick={() => setSelectedId(audit.id)} className={`w-full rounded-2xl p-3 text-left ${audit.id === selectedId ? "bg-[#0A4FE8] text-white" : "hover:bg-slate-50"}`}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">{audit.brand_name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${audit.id === selectedId ? "bg-white/15" : "bg-blue-50 text-[#0A4FE8]"}`}>{audit.overall_score}</span>
                  </span>
                  <span className={`mt-1 flex flex-wrap gap-2 text-[11px] ${audit.id === selectedId ? "text-blue-100" : "text-slate-400"}`}>
                    {audit.share_enabled ? <span>Shared</span> : <span>Private</span>}
                    {audit.view_count > 0 ? <span>{audit.view_count} opened</span> : null}
                    {audit.refined_count > 0 ? <span>refined {audit.refined_count}x</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {selected ? (
          <section className="min-w-0 space-y-5">
            <div className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-[#07133B]">{selected.brand_name}</h2>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {selected.target_url}
                  {selected.last_viewed_at ? ` · last opened ${when(selected.last_viewed_at)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["report", "edit", "share"] as const).map((key) => (
                  <button key={key} onClick={() => setTab(key)} className={`h-10 rounded-xl px-4 text-sm font-semibold capitalize ${tab === key ? "bg-[#0A4FE8] text-white" : "bg-slate-100 text-slate-600"}`}>{key}</button>
                ))}
                <button
                  type="button"
                  onClick={draftProposal}
                  disabled={busy === "proposal"}
                  title={`Draft a proposal from the ${selected.brand_name} audit`}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy === "proposal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  <span className="hidden sm:inline">Proposal</span>
                </button>
                <a href={`/api/admin/deals/audits/${selected.id}/pdf`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:border-[#0A4FE8]"><Download className="h-4 w-4" /><span className="hidden sm:inline">PDF</span></a>
                <button type="button" onClick={remove} aria-label="Delete audit" className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            {tab === "report" && (
              <>
                <div className="rounded-[24px] border border-blue-100 bg-blue-50/60 p-5">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[#07133B]"><RefreshCw className="h-4 w-4 text-[#0A4FE8]" /> Refine this audit</h3>
                  <p className="mt-1 text-xs text-slate-500">Say what to reconsider. The site is researched again and the report rewritten, keeping everything that still holds. Your note steers the rewrite; it is never treated as evidence.</p>
                  <textarea
                    value={refineNote}
                    onChange={(event) => setRefineNote(event.target.value)}
                    rows={3}
                    placeholder="For example: they relaunched the site last month, judge the new one. Or: go harder on the social inconsistency."
                    className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0A4FE8]"
                  />
                  <button type="button" onClick={refine} disabled={busy === "refine" || !refineNote.trim()} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {busy === "refine" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refine
                  </button>
                </div>
                <AuditReport audit={selected} />
              </>
            )}

            {tab === "edit" && draft && (
              <div className="space-y-5">
                <p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">The report is ours to correct. Nothing here reaches the client until you save.</p>
                <Panel title="Summary">
                  <Area label="Opening summary" rows={4} value={draft.summary || ""} onChange={(value) => patch({ summary: value })} />
                  <Area label="What it can become" rows={4} value={draft.future_state || ""} onChange={(value) => patch({ future_state: value })} />
                </Panel>

                <Panel title="Scorecard">
                  {(draft.scores || []).map((item, index) => (
                    <div key={`${item.area}-${index}`} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex gap-2">
                        <input value={item.area} onChange={(event) => patch({ scores: draft.scores.map((entry, position) => (position === index ? { ...entry, area: event.target.value } : entry)) })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#0A4FE8]" />
                        <input type="number" min={0} max={100} value={item.score} onChange={(event) => patch({ scores: draft.scores.map((entry, position) => (position === index ? { ...entry, score: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } : entry)) })} className="h-10 w-24 shrink-0 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" />
                      </div>
                      <textarea rows={2} value={item.explanation} onChange={(event) => patch({ scores: draft.scores.map((entry, position) => (position === index ? { ...entry, explanation: event.target.value } : entry)) })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]" />
                    </div>
                  ))}
                  <p className="text-xs text-slate-400">The overall score is the average of these, recalculated on save.</p>
                </Panel>

                <Panel title="Touchpoints">
                  {(draft.touchpoints || []).map((touchpoint, index) => (
                    <div key={touchpoint.key} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm text-[#07133B]">{touchpoint.label}</strong>
                        <select value={touchpoint.state} onChange={(event) => patchTouchpoint(index, { state: event.target.value as DealAuditTouchpoint["state"] })} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#0A4FE8]">
                          {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                        </select>
                      </div>
                      <textarea rows={2} value={touchpoint.observation} onChange={(event) => patchTouchpoint(index, { observation: event.target.value })} placeholder="What we found" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]" />
                      <textarea rows={2} value={touchpoint.fix} onChange={(event) => patchTouchpoint(index, { fix: event.target.value })} placeholder="What to do about it" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]" />
                    </div>
                  ))}
                </Panel>

                <Panel title="Priority actions">
                  {(draft.recommendations || []).map((item, index) => (
                    <div key={`${item.title}-${index}`} className="rounded-xl border border-slate-200 p-3">
                      <input value={item.title} onChange={(event) => patch({ recommendations: draft.recommendations.map((entry, position) => (position === index ? { ...entry, title: event.target.value } : entry)) })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#0A4FE8]" />
                      <textarea rows={2} value={item.action} onChange={(event) => patch({ recommendations: draft.recommendations.map((entry, position) => (position === index ? { ...entry, action: event.target.value } : entry)) })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]" />
                      <input value={item.expected_outcome} onChange={(event) => patch({ recommendations: draft.recommendations.map((entry, position) => (position === index ? { ...entry, expected_outcome: event.target.value } : entry)) })} placeholder="Expected outcome" className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" />
                    </div>
                  ))}
                </Panel>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={saveEdits} disabled={busy === "save"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60">
                    {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Save audit
                  </button>
                  <button type="button" onClick={() => { setDraft(JSON.parse(JSON.stringify(selected.content || {}))); setTab("report"); }} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600">
                    <X className="h-4 w-4" /> Discard changes
                  </button>
                </div>
              </div>
            )}

            {tab === "share" && (
              <div className="space-y-5">
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-[#07133B]"><Share2 className="h-5 w-5 text-[#0A4FE8]" /> View-only link for the client</h3>
                  <p className="mt-1 text-sm text-slate-500">Anyone with this link reads the audit and can download the PDF. They cannot edit it and they see none of our workspace.</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 outline-none" />
                    <button type="button" onClick={copyLink} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white">
                      <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy link"}
                    </button>
                    <Link href={`/audit/${selected.public_token}`} target="_blank" rel="noreferrer" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:border-[#0A4FE8]">
                      <ExternalLink className="h-4 w-4" /> Preview
                    </Link>
                  </div>
                  <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={selected.share_enabled} disabled={busy === "share"} onChange={(event) => setShare(event.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span>
                      Link is live
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">Switching this off makes the link stop resolving without deleting the audit.</span>
                    </span>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Times opened" value={selected.view_count || 0} />
                  <Metric label="Last opened" value={when(selected.last_viewed_at) || "Not opened"} small />
                  <Metric label="Times refined" value={selected.refined_count || 0} />
                </div>

                {selected.sources?.length > 0 && (
                  <div className="rounded-[24px] bg-slate-50 p-5">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[#07133B]"><Link2 className="h-4 w-4" /> Evidence sources</h3>
                    <div className="mt-3 space-y-2">
                      {selected.sources.map((source, index) => (
                        <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-xs font-medium text-[#0A4FE8] hover:underline">
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />{source.title || source.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="grid min-h-80 place-items-center rounded-[24px] border border-dashed border-slate-200 bg-white text-sm text-slate-400">Select or generate an audit.</section>
        )}
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="rounded-2xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-bold text-[#07133B]">{title}</summary>
      <div className="mt-4 space-y-3">{children}</div>
    </details>
  );
}

function Metric({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className={`mt-1 block font-bold text-[#07133B] ${small ? "text-sm" : "text-2xl"}`}>{value}</span>
    </div>
  );
}

function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#0A4FE8]" />
    </label>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>;
}
