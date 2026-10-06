 
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2, Check, ChevronRight, Clock, ExternalLink, FileText, Loader2, RefreshCw, Search, X,
} from "lucide-react";
import { PIPELINE_STAGES, type PipelineProspect, type PipelineStage } from "@/lib/deal-pipeline-stages";

const STAGE_TONE: Record<string, string> = {
  shortlisted: "bg-slate-100 text-slate-600",
  contacted: "bg-sky-50 text-sky-700",
  audit_shared: "bg-cyan-50 text-cyan-700",
  proposal_sent: "bg-indigo-50 text-indigo-700",
  proposal_viewed: "bg-amber-50 text-amber-700",
  meeting_scheduled: "bg-violet-50 text-violet-700",
  invoice_sent: "bg-orange-50 text-orange-700",
  paid: "bg-emerald-50 text-emerald-700",
  project_started: "bg-blue-50 text-[#0A4FE8]",
  project_completed: "bg-emerald-100 text-emerald-800",
  lost: "bg-rose-50 text-rose-700",
};
const STAGE_LABEL: Record<string, string> = {
  ...Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.key, stage.label])),
  lost: "Not going ahead",
};
/** A prospect nobody has touched for this long is the one worth chasing. */
const IDLE_WARNING_DAYS = 14;

function when(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
}
function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

export default function DealPipelinePage() {
  const [rows, setRows] = useState<PipelineProspect[]>([]);
  const [stageFilter, setStageFilter] = useState<"all" | PipelineStage>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = async (quiet = false) => {
    if (quiet) setRefreshing(true);
    setError("");
    let lastIssue: unknown = null;
    // A cold remote database may reject its first connection while waking.
    // Retry server failures twice; permission failures must still fail closed.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch("/api/admin/deals?resource=pipeline", { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          const issue = new Error(json.error || "Could not load the pipeline.");
          if (response.status < 500) throw issue;
          lastIssue = issue;
        } else {
          setRows(json.pipeline || []);
          setError("");
          setLoading(false); setRefreshing(false);
          return;
        }
      } catch (issue) {
        lastIssue = issue;
        if (issue instanceof Error && /Unauthorized|Forbidden/i.test(issue.message)) break;
      }
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)));
    }
    setError(lastIssue instanceof Error ? lastIssue.message : "Could not load the pipeline.");
    setLoading(false); setRefreshing(false);
  };
  useEffect(() => { load(); }, []);  

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    rows.forEach((row) => { tally[row.stage] = (tally[row.stage] || 0) + 1; });
    return tally;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (stageFilter !== "all" && row.stage !== stageFilter) return false;
      if (!needle) return true;
      return [row.display_name, row.company_name, row.email].some((value) => (value || "").toLowerCase().includes(needle));
    });
  }, [rows, stageFilter, query]);

  const open = useMemo(() => rows.find((row) => row.id === openId) || null, [rows, openId]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenId(""); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  return (
    <main className="mx-auto max-w-[1600px] p-4 sm:p-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0A4FE8]">Deals</p>
          <h1 className="mt-1 text-3xl font-bold text-[#07133B]">Prospect pipeline</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Where every prospect stands, read from what has actually happened: the checklist, outreach, audits, proposals, consultations, invoices and projects. Nothing here is moved by hand.
          </p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:border-[#0A4FE8] disabled:opacity-60">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </button>
      </header>

      {error && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        <span>{error}</span>
        <button type="button" onClick={() => load(true)} disabled={refreshing} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:border-rose-400 disabled:opacity-60">
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Try again
        </button>
      </div>}

      {/* One tab per stage, in the order a deal actually travels. */}
      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        <StageTab label="Everyone" total={rows.length} hint="On the checklist" active={stageFilter === "all"} onClick={() => setStageFilter("all")} />
        {PIPELINE_STAGES.map((stage) => (
          <StageTab key={stage.key} label={stage.label} hint={stage.hint} total={counts[stage.key] || 0} active={stageFilter === stage.key} onClick={() => setStageFilter(stage.key)} />
        ))}
        <StageTab label="Not going ahead" hint="Closed out" total={counts.lost || 0} active={stageFilter === "lost"} onClick={() => setStageFilter("lost")} />
      </section>

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, company or email" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#0A4FE8]" />
      </div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>
        ) : visible.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-slate-400">
            {rows.length === 0 ? "Nothing on the checklist yet. Shortlist a company in prospect generation to start the pipeline." : "No prospect matches this view."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Prospect</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Last touch</th>
                  <th className="px-4 py-3">Next action</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setOpenId(row.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open the timeline for ${row.display_name}`}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenId(row.id); } }}
                    className="cursor-pointer hover:bg-blue-50/60 focus:bg-blue-50/60 focus:outline-none"
                  >
                    <td className="px-5 py-3">
                      <span className="block font-semibold text-[#07133B]">{row.company_name || row.display_name}</span>
                      <span className="block truncate text-xs text-slate-400">{row.email || row.display_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${STAGE_TONE[row.stage]}`}>{STAGE_LABEL[row.stage]}</span>
                    </td>
                    <td className="px-4 py-3"><StageTrack reached={row.reached} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {day(row.last_touch_at) || "Never"}
                      {row.idle_days !== null && row.idle_days >= IDLE_WARNING_DAYS && row.stage !== "project_completed" && row.stage !== "lost" && (
                        <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <Clock className="h-3 w-3" />{row.idle_days}d quiet
                        </span>
                      )}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-xs text-slate-500">{row.next_action || "-"}</td>
                    <td className="px-5 py-3 text-right"><span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A4FE8]">Timeline <ChevronRight className="h-3.5 w-3.5" /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <div className="layer-modal-top fixed inset-0 flex items-end justify-center bg-[#07133B]/60 p-3 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpenId(""); }}>
          <div role="dialog" aria-modal="true" aria-label={`${open.display_name} timeline`} className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(7,19,59,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-[#07133B]">{open.company_name || open.display_name}</h2>
                <p className="mt-0.5 truncate text-xs text-slate-400">{[open.email, open.website].filter(Boolean).join(" · ") || open.display_name}</p>
              </div>
              <button type="button" onClick={() => setOpenId("")} aria-label="Close timeline" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${STAGE_TONE[open.stage]}`}>{STAGE_LABEL[open.stage]}</span>
                {open.stage_reached_at && <span className="text-xs text-slate-400">since {day(open.stage_reached_at)}</span>}
              </div>

              <div className="flex flex-wrap gap-2">
                {open.company_id && <Link href={`/admin/deals/prospect-generation?company=${open.company_id}`} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-[#0A4FE8]"><Building2 className="h-3.5 w-3.5" /> Company details</Link>}
                <Link href={`/admin/deals/prospects`} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-[#0A4FE8]">Checklist entry</Link>
                {open.proposal_id && <Link href={`/admin/deals/proposals?proposal=${open.proposal_id}`} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-[#0A4FE8]"><FileText className="h-3.5 w-3.5" /> Proposal</Link>}
                {open.audit_id && <Link href={`/admin/deals/brand-audits?audit=${open.audit_id}`} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-[#0A4FE8]">Brand audit</Link>}
                {open.website && <a href={open.website} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-[#0A4FE8]"><ExternalLink className="h-3.5 w-3.5" /> Website</a>}
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#07133B]">Progress</h3>
                <ol className="mt-3 space-y-1.5">
                  {PIPELINE_STAGES.map((stage) => {
                    const done = open.reached.includes(stage.key);
                    return (
                      <li key={stage.key} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${done ? "bg-blue-50 text-[#07133B]" : "text-slate-400"}`}>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? "bg-[#0A4FE8] text-white" : "border border-slate-200"}`}>
                          {done ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="font-semibold">{stage.label}</span>
                        <span className="ms-auto text-xs text-slate-400">{stage.hint}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#07133B]">What has happened</h3>
                {open.events.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">Nothing recorded yet.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {open.events.map((event, index) => (
                      <li key={`${event.occurred_at}-${index}`} className="flex gap-3 text-sm">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.stage ? "bg-[#0A4FE8]" : "bg-slate-300"}`} />
                        <span className="min-w-0">
                          <strong className="text-[#07133B]">{event.event_type}</strong>
                          {event.detail ? <span className="text-slate-600"> · {event.detail}</span> : null}
                          <span className="block text-xs text-slate-400">{when(event.occurred_at)} · from {event.source}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StageTab({ label, hint, total, active, onClick }: { label: string; hint: string; total: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={hint} className={`rounded-2xl border p-3 text-left transition ${active ? "border-[#0A4FE8] bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"}`}>
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className="mt-1 block text-2xl font-bold text-[#07133B]">{total}</span>
    </button>
  );
}

/** A compact read of how far along a prospect is, one notch per stage. */
function StageTrack({ reached }: { reached: PipelineStage[] }) {
  return (
    <span className="flex gap-1">
      {PIPELINE_STAGES.map((stage) => (
        <span
          key={stage.key}
          title={`${stage.label}: ${reached.includes(stage.key) ? "reached" : "not yet"}`}
          className={`h-1.5 w-4 rounded-full ${reached.includes(stage.key) ? "bg-[#0A4FE8]" : "bg-slate-200"}`}
        />
      ))}
    </span>
  );
}
