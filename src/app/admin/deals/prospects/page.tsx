 
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, FileText, Landmark, Loader2, Mail, MapPin, Pencil, PenLine, Plus, RefreshCw, Send, Trash2, UsersRound, X } from "lucide-react";
import { appConfirm } from "@/lib/app-notify";
import { issueLabel } from "@/lib/prospect-issues";
import { ACTIVITY_TONE, PRIORITY_TONE, ProspectResearchPanel, WEBSITE_TONE, type ProspectResearch, type ResearchEditHandler } from "@/components/deals/ProspectResearchPanel";
import { ProposalPreviewModal } from "@/components/deals/ProposalPreviewModal";
import { FirstEmailComposer, recipientsFor } from "@/components/deals/FirstEmailComposer";
import type { ResearchOverrides } from "@/lib/prospect-research-overrides";

type ResearchSummary = { id: string; deal_score: number; priority: string; activity_status: string; website_status: string; website_score: number | null; issues: string[] | null; is_public: boolean | null; stock_exchanges: string[] | null; ticker: string | null; industry: string | null; city: string | null; country: string | null; founded_year: number | null; employee_count: number | null; domain: string | null; enriched_at: string | null };
type Prospect = { id: string; research_summary?: ResearchSummary | null; research_brief: string | null; category: string; display_name: string; company_name: string | null; website: string | null; social_url: string | null; email: string | null; phone: string | null; location: string | null; notes: string | null; next_action: string | null; follow_up_at: string | null; status: string; updated_at: string; research_company_id?: string | null; research_overrides?: ResearchOverrides };
type ProspectForm = Omit<Prospect, "id" | "updated_at" | "research_company_id" | "research_overrides" | "research_summary"> & { id?: string };
/** What a recheck changed, shown above the research it refreshed. */
type RecheckResult = { at: number; scoreBefore: number | null; scoreAfter: number | null; added: string[]; removed: string[]; editedKept: string[]; failed?: string };
const EMPTY: ProspectForm = { research_brief: "", category: "potential_client", display_name: "", company_name: "", website: "", social_url: "", email: "", phone: "", location: "", notes: "", next_action: "", follow_up_at: "", status: "to_research" };
const CATEGORIES = [{ value: "potential_client", label: "Potential clients" }, { value: "investor", label: "Investors" }, { value: "influencer", label: "Influencers" }, { value: "industry_leader", label: "Industry leaders" }];
const STATUSES = [{ value: "to_research", label: "To research" }, { value: "ready", label: "Ready" }, { value: "contacted", label: "Contacted" }, { value: "follow_up", label: "Follow up" }, { value: "converted", label: "Converted" }, { value: "not_relevant", label: "Not relevant" }];

function formFrom(prospect: Prospect): ProspectForm { const { research_company_id: _link, research_overrides: _edits, research_summary: _summary, ...rest } = prospect; void _link; void _edits; void _summary; return { ...rest, research_brief: prospect.research_brief || "", company_name: prospect.company_name || "", website: prospect.website || "", social_url: prospect.social_url || "", email: prospect.email || "", phone: prospect.phone || "", location: prospect.location || "", notes: prospect.notes || "", next_action: prospect.next_action || "", follow_up_at: prospect.follow_up_at ? new Date(prospect.follow_up_at).toISOString().slice(0, 16) : "" }; }

export default function DealProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState<ProspectForm>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const lastSaved = useRef("");
  const router = useRouter();
  // The directory research behind each entry, fetched when its details open.
  const [research, setResearch] = useState<Record<string, ProspectResearch>>({});
  const [expanded, setExpanded] = useState("");
  const [rechecking, setRechecking] = useState<{ id: string; started: number } | null>(null);
  const [recheckSeconds, setRecheckSeconds] = useState(0);
  const [recheckResults, setRecheckResults] = useState<Record<string, RecheckResult>>({});
  const [proposalFor, setProposalFor] = useState<Prospect | null>(null);
  const proposalSource = useMemo(() => proposalFor ? { from_prospect_id: proposalFor.id } : null, [proposalFor]);
  const visible = useMemo(() => filter === "all" ? prospects : prospects.filter((item) => item.category === filter), [prospects, filter]);

  const load = async () => {
    const response = await fetch("/api/admin/deals?resource=prospects", { cache: "no-store" }); const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load prospects."); setProspects(json.prospects || []);
  };
  useEffect(() => { load().catch((error) => setNotice({ tone: "error", text: error.message })).finally(() => setLoading(false)); }, []);  

  useEffect(() => {
    if (!form.id) return;
    const signature = JSON.stringify(form);
    if (signature === lastSaved.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_prospect", ...form }) });
        const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error || "Autosave failed.");
        lastSaved.current = signature; setSaveState("saved"); setProspects((items) => items.map((item) => item.id === form.id ? json.prospect : item));
      } catch { setSaveState("error"); }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [form]);

  useEffect(() => {
    if (!formOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy !== "save") setFormOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [formOpen, busy]);

  // If an edit is dismissed while its debounced save is still running, keep the
  // form in memory until that save finishes. This avoids losing the final edit.
  useEffect(() => {
    if (formOpen || !form.id || saveState !== "saved") return;
    setForm(EMPTY);
    lastSaved.current = "";
  }, [formOpen, form.id, saveState]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy("save"); setNotice(null);
    try {
      const response = await fetch("/api/admin/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_prospect", ...form }) });
      const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error || "Prospect could not be saved.");
      setProspects((items) => form.id ? items.map((item) => item.id === form.id ? json.prospect : item) : [json.prospect, ...items]);
      setForm(EMPTY); setFormOpen(false); lastSaved.current = ""; setSaveState("saved"); setNotice({ tone: "success", text: form.id ? "Prospect updated." : "Prospect added to the checklist." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Prospect could not be saved." }); }
    finally { setBusy(""); }
  };
  const edit = (prospect: Prospect) => { const next = formFrom(prospect); setForm(next); lastSaved.current = JSON.stringify(next); setSaveState("saved"); setFormOpen(true); };
  const remove = async (prospect: Prospect) => {
    if (!(await appConfirm({ title: "Remove prospect?", message: `Remove ${prospect.display_name} from the checklist?`, confirmLabel: "Remove" }))) return;
    setBusy(prospect.id);
    const response = await fetch("/api/admin/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_prospect", id: prospect.id }) });
    const json = await response.json().catch(() => ({}));
    if (response.ok) { setProspects((items) => items.filter((item) => item.id !== prospect.id)); if (form.id === prospect.id) { setForm(EMPTY); setFormOpen(false); } }
    else setNotice({ tone: "error", text: json.error || "Prospect could not be removed." });
    setBusy("");
  };

  /**
   * A proposal for this prospect opens on what it will be written from - the
   * research as the team corrected it, plus their notes - for a final check.
   */
  const draftProposal = (prospect: Prospect) => {
    if (!prospect.website && !prospect.social_url && !prospect.research_company_id) {
      setNotice({ tone: "error", text: `${prospect.display_name} needs a website or social link before a proposal can be built.` });
      return;
    }
    setProposalFor(prospect);
  };

  const loadResearch = useCallback(async (companyId: string) => {
    const response = await fetch(`/api/admin/deals/prospect-generation?resource=company&id=${companyId}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Could not load the research for this company.");
    setResearch((current) => ({ ...current, [companyId]: json.company }));
    return json.company as ProspectResearch;
  }, []);

  const toggleDetails = (prospect: Prospect) => {
    const opening = expanded !== prospect.id;
    setExpanded(opening ? prospect.id : "");
    if (opening && prospect.research_company_id && !research[prospect.research_company_id]) {
      loadResearch(prospect.research_company_id).catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load the research." }));
    }
  };

  /** Saves one corrected section of the research on this checklist entry. */
  const editResearch = (prospect: Prospect): ResearchEditHandler => async (field, value) => {
    const response = await fetch("/api/admin/deals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_research_overrides", id: prospect.id, changes: { [field]: value } }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) throw new Error(json.error || "The correction could not be saved.");
    setProspects((items) => items.map((item) => item.id === prospect.id ? { ...item, research_overrides: json.overrides } : item));
  };

  const [writingEmail, setWritingEmail] = useState("");
  // The first email is written and sent right here, without leaving the checklist.
  const [composeFor, setComposeFor] = useState<ProspectResearch | null>(null);
  /**
   * Re-audits the company live and writes its first email in the CEO's voice.
   * A hand edit of the subject or email would hide the new draft, so those
   * corrections are cleared; the email can be edited again afterwards.
   */
  const writeEmail = async (prospect: Prospect) => {
    const companyId = prospect.research_company_id;
    if (!companyId) return;
    setWritingEmail(prospect.id); setNotice(null);
    try {
      const response = await fetch("/api/admin/deals/prospect-generation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rewrite_outreach", id: companyId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "The email could not be written.");
      const edits = prospect.research_overrides || {};
      if ("outreach_subject" in edits || "outreach_email" in edits) {
        await editResearch(prospect)("outreach_subject", null);
        await editResearch(prospect)("outreach_email", null);
      }
      await loadResearch(companyId);
      setNotice({ tone: "success", text: `A new first email for ${prospect.company_name || prospect.display_name} is ready under Details.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The email could not be written." });
    } finally { setWritingEmail(""); }
  };

  const copyRecipients = async (company: ProspectResearch) => {
    const recipients = recipientsFor(company);
    if (!recipients.length) { setNotice({ tone: "error", text: "No email address was found for this company." }); return; }
    try { await navigator.clipboard.writeText(recipients.join(", ")); setNotice({ tone: "success", text: `${recipients.length} address${recipients.length === 1 ? "" : "es"} copied.` }); }
    catch { setNotice({ tone: "error", text: "The addresses could not be copied." }); }
  };

  // A running clock while a recheck works, so a long one never looks stuck.
  useEffect(() => {
    if (!rechecking) return;
    setRecheckSeconds(0);
    const timer = window.setInterval(() => setRecheckSeconds(Math.round((Date.now() - rechecking.started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [rechecking]);

  /**
   * Runs the company's research again, now, and reports what changed. Sections
   * the team has corrected keep the correction; the fresh research is still
   * there behind them, one "Reset to research" away.
   */
  const recheck = async (prospect: Prospect) => {
    const companyId = prospect.research_company_id;
    if (!companyId) return;
    setRechecking({ id: prospect.id, started: Date.now() });
    setExpanded(prospect.id);
    const previous = research[companyId] || await loadResearch(companyId).catch(() => null);
    const post = async (body: Record<string, unknown>) => {
      const response = await fetch("/api/admin/deals/prospect-generation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "The recheck could not be completed.");
      return json;
    };
    try {
      await post({ action: "requeue", id: companyId });
      const json = await post({ action: "enrich_batch", id: companyId, limit: 1 });
      const outcome = json.processed?.find((entry: { id: string }) => entry.id === companyId);
      const fresh = await loadResearch(companyId);
      if (!outcome || outcome.status !== "enriched") {
        setRecheckResults((current) => ({ ...current, [prospect.id]: { at: Date.now(), scoreBefore: null, scoreAfter: null, added: [], removed: [], editedKept: [], failed: fresh.enrichment_error || "The website or sources could not be reached this time. The previous research is still shown." } }));
        return;
      }
      const before = new Set(previous?.website_findings || []);
      const after = new Set(fresh.website_findings || []);
      setRecheckResults((current) => ({
        ...current,
        [prospect.id]: {
          at: Date.now(),
          scoreBefore: previous?.website_score ?? null,
          scoreAfter: fresh.website_score ?? null,
          added: [...after].filter((finding) => !before.has(finding)),
          removed: [...before].filter((finding) => !after.has(finding)),
          editedKept: Object.keys(prospect.research_overrides || {}),
        },
      }));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The recheck could not be completed." });
    } finally {
      setRechecking(null);
    }
  };

  const hasNewDraft = !form.id && JSON.stringify(form) !== JSON.stringify(EMPTY);

  return <main className="mx-auto max-w-[1550px] p-4 sm:p-7">
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-sm font-semibold text-[#0A4FE8]">Deals</p><h1 className="mt-1 text-3xl font-bold text-[#07133B]">Prospect checklist</h1><p className="mt-2 text-sm text-slate-500">Keep prospect context, next actions, and follow-up dates organised across four relationship types.</p></div>
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#0846cf]"
      >
        <Plus className="h-4 w-4" />{form.id ? "Continue editing" : hasNewDraft ? "Continue draft" : "Add prospect"}
      </button>
    </header>
    {notice && <div className={`mb-5 rounded-2xl border p-4 text-sm ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

    <div className="mb-5 flex gap-2 overflow-x-auto pb-1"><button onClick={() => setFilter("all")} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${filter === "all" ? "bg-[#0A4FE8] text-white" : "border border-slate-200 bg-white text-slate-500"}`}>All ({prospects.length})</button>{CATEGORIES.map((category) => <button key={category.value} onClick={() => setFilter(category.value)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${filter === category.value ? "bg-[#0A4FE8] text-white" : "border border-slate-200 bg-white text-slate-500"}`}>{category.label} ({prospects.filter((item) => item.category === category.value).length})</button>)}</div>
    {loading ? <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div> : visible.length === 0 ? <div className="grid min-h-72 place-items-center rounded-[24px] border border-dashed border-slate-200 bg-white text-center"><div><UsersRound className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm text-slate-400">No prospects in this category.</p></div></div> : <ul className="space-y-3">{visible.map((prospect) => {
      const summary = prospect.research_summary || null;
      const company = prospect.research_company_id ? research[prospect.research_company_id] : undefined;
      const open = expanded === prospect.id;
      const result = recheckResults[prospect.id];
      const isRechecking = rechecking?.id === prospect.id;
      const editedCount = Object.keys(prospect.research_overrides || {}).length;
      return <li key={prospect.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-[#07133B]">{prospect.display_name}</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#0A4FE8]">{STATUSES.find((item) => item.value === prospect.status)?.label}</span>
              {summary && <>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PRIORITY_TONE[summary.priority] || PRIORITY_TONE.low}`} title="Deal score out of 100">{summary.deal_score} score</span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${ACTIVITY_TONE[summary.activity_status] || ACTIVITY_TONE.unknown}`}>{summary.activity_status}</span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${WEBSITE_TONE[summary.website_status] || WEBSITE_TONE.unknown}`}>{summary.website_status} website</span>
                {summary.is_public && <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"><Landmark className="h-3 w-3" /> {summary.stock_exchanges?.length ? `${summary.stock_exchanges.join(", ")}${summary.ticker ? `: ${summary.ticker}` : ""}` : "Publicly traded"}</span>}
                {(summary.issues || []).map((issue) => (
                  <span key={issue} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800"><AlertTriangle className="h-3 w-3" /> {issueLabel(issue)}</span>
                ))}
                {editedCount > 0 && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700" title="Sections of the research the team has corrected">{editedCount} edited</span>}
              </>}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{[
              prospect.company_name && prospect.company_name !== prospect.display_name ? prospect.company_name : "",
              summary?.industry || CATEGORIES.find((item) => item.value === prospect.category)?.label,
              [summary?.city, summary?.country || prospect.location].filter(Boolean).join(", "),
              summary?.employee_count ? `${summary.employee_count.toLocaleString()} staff` : "",
              summary?.founded_year ? `founded ${summary.founded_year}` : "",
            ].filter(Boolean).join(" · ")}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold text-[#0A4FE8]">
              {prospect.website && <a href={prospect.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">{summary?.domain || "Website"} <ExternalLink className="h-3 w-3" /></a>}
              {prospect.social_url && <a href={prospect.social_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">Social <ExternalLink className="h-3 w-3" /></a>}
              {prospect.email && <a href={`mailto:${prospect.email}`}>{prospect.email}</a>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {prospect.research_company_id && <RowButton label={isRechecking ? `Rechecking ${recheckSeconds}s` : "Recheck findings"} title="Run this company's research again now and see what changed" icon={RefreshCw} busy={isRechecking} disabled={Boolean(rechecking)} onClick={() => void recheck(prospect)} />}
            <RowButton label="Proposal" title={`Check the details, then draft a proposal for ${prospect.display_name}`} icon={FileText} onClick={() => draftProposal(prospect)} />
            <RowButton label="Edit" title="Edit the checklist entry" icon={Pencil} onClick={() => edit(prospect)} />
            <RowButton label="Details" icon={open ? ChevronUp : ChevronDown} onClick={() => toggleDetails(prospect)} active={open} />
            <RowButton label="Remove" icon={Trash2} tone="danger" iconOnly busy={busy === prospect.id} onClick={() => remove(prospect)} />
          </div>
        </div>
        {(prospect.next_action || prospect.follow_up_at) && <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-[#F3F6FC] px-3 py-2 text-sm text-slate-600">
          {prospect.next_action && <span><span className="text-xs font-semibold text-slate-400">Next action </span>{prospect.next_action}</span>}
          {prospect.follow_up_at && <span className="text-xs text-slate-500">Follow up {new Date(prospect.follow_up_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>}
        </div>}

        {open && <div className="mt-4 border-t border-slate-100 pt-4">
          {isRechecking && <p className="mb-4 inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-[#0A4FE8]"><Loader2 className="h-4 w-4 animate-spin" /> Visiting the website and checking public sources again ({recheckSeconds}s). This usually takes under a minute.</p>}
          {result && !isRechecking && <RecheckSummary result={result} onDismiss={() => setRecheckResults((current) => { const next = { ...current }; delete next[prospect.id]; return next; })} />}
          {prospect.research_company_id ? (company ? (
            <ProspectResearchPanel
              company={company}
              overrides={prospect.research_overrides}
              onEdit={editResearch(prospect)}
              outreachActions={<div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void writeEmail(prospect)} disabled={Boolean(writingEmail)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#0A4FE8] px-3 text-xs font-semibold text-[#0A4FE8] hover:bg-[#0A4FE8]/5 disabled:opacity-50" title="Look at the company again and write the first email in the CEO's voice">
                  {writingEmail === prospect.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                  {writingEmail === prospect.id ? "Studying them and writing..." : "Write with AI"}
                </button>
                <button type="button" onClick={() => setComposeFor(company)} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#0A4FE8] px-3 text-xs font-semibold text-white"><Send className="h-3.5 w-3.5" /> Compose email</button>
                <button type="button" onClick={() => void copyRecipients(company)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-[#0A4FE8]"><Mail className="h-3.5 w-3.5" /> Copy recipients</button>
                <span className="text-xs text-slate-500">{recipientsFor(company).length} address{recipientsFor(company).length === 1 ? "" : "es"} found{recipientsFor(company).length ? `: ${recipientsFor(company).join(", ")}` : ""}</span>
              </div>}
            />
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading research</p>
          )) : (
            <div>
              <p className="text-xs font-semibold text-slate-600">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{prospect.notes || prospect.research_brief || "Nothing recorded yet. Use Edit to add what you know."}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5" /> Added by hand, so there is no directory research to recheck. Shortlist the company in Prospect generation to research it.</p>
            </div>
          )}
        </div>}
      </li>;
    })}</ul>}

    {formOpen && <div
      className="layer-modal-top fixed inset-0 flex items-end justify-center bg-[#07133B]/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => { if (event.currentTarget === event.target && busy !== "save") setFormOpen(false); }}
    >
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="prospect-form-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(7,19,59,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
          <div>
            <h2 id="prospect-form-title" className="text-lg font-bold text-[#07133B]">{form.id ? "Edit prospect" : "Add a prospect"}</h2>
            <p className={`mt-1 text-xs ${saveState === "error" ? "text-rose-600" : "text-slate-400"}`}>{form.id ? saveState === "saving" ? "Saving changes..." : saveState === "error" ? "Autosave failed. Keep this form open and try Save now." : "Changes autosave" : "Add the details you already have. You can complete the rest later."}</p>
          </div>
          <button type="button" onClick={() => setFormOpen(false)} disabled={busy === "save"} aria-label="Close prospect form" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Select label="Category" value={form.category} options={CATEGORIES} onChange={(value) => setForm({ ...form, category: value })} />
            <Field label="Person or brand name" required value={form.display_name} onChange={(value) => setForm({ ...form, display_name: value })} />
            <Field label="Company" value={form.company_name || ""} onChange={(value) => setForm({ ...form, company_name: value })} />
            <Select label="Status" value={form.status} options={STATUSES} onChange={(value) => setForm({ ...form, status: value })} />
            <Field label="Website" type="url" value={form.website || ""} onChange={(value) => setForm({ ...form, website: value })} />
            <Field label="Social link" type="url" value={form.social_url || ""} onChange={(value) => setForm({ ...form, social_url: value })} />
            <Field label="Email" type="email" value={form.email || ""} onChange={(value) => setForm({ ...form, email: value })} />
            <Field label="Phone" value={form.phone || ""} onChange={(value) => setForm({ ...form, phone: value })} />
            <Field label="Location" value={form.location || ""} onChange={(value) => setForm({ ...form, location: value })} />
            <Field label="Follow-up date" type="datetime-local" value={form.follow_up_at || ""} onChange={(value) => setForm({ ...form, follow_up_at: value })} />
            <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Next action</span><input value={form.next_action || ""} onChange={(event) => setForm({ ...form, next_action: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
            <label className="md:col-span-2 xl:col-span-4"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</span><textarea rows={3} value={form.notes || ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0A4FE8]" /></label>
            {!prospects.find((item) => item.id === form.id)?.research_company_id && <label className="md:col-span-2 xl:col-span-4">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Research brief</span>
              <span className="mb-1.5 block text-xs text-slate-400">Copied from prospect generation when this company was added. Yours to edit: correct anything the research got wrong and add your own findings.</span>
              <textarea rows={12} value={form.research_brief || ""} onChange={(event) => setForm({ ...form, research_brief: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs leading-5 outline-none focus:border-[#0A4FE8]" />
            </label>}
            {prospects.find((item) => item.id === form.id)?.research_company_id && <p className="text-xs text-slate-400 md:col-span-2 xl:col-span-4">This company&apos;s research is shown under Details on its row. Correct any section there; your corrections survive a recheck.</p>}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <button type="button" onClick={() => setFormOpen(false)} disabled={busy === "save"} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-40">Close</button>
          <button disabled={busy === "save"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : form.id ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{form.id ? "Save now" : "Add prospect"}</button>
        </div>
      </form>
    </div>}
    {composeFor && <FirstEmailComposer
      company={composeFor}
      onClose={() => setComposeFor(null)}
      onSent={(next) => { setNotice(next); void load().catch(() => undefined); }}
      onChanged={() => void loadResearch(composeFor.id).catch(() => undefined)}
    />}
    {proposalFor && proposalSource && <ProposalPreviewModal
      source={proposalSource}
      label={proposalFor.company_name || proposalFor.display_name}
      onClose={() => setProposalFor(null)}
      onGenerated={(proposalId) => router.push(`/admin/deals/proposals?proposal=${encodeURIComponent(proposalId)}`)}
    />}
  </main>;
}

function RecheckSummary({ result, onDismiss }: { result: RecheckResult; onDismiss: () => void }) {
  const scoreMoved = result.scoreBefore !== null && result.scoreAfter !== null && result.scoreBefore !== result.scoreAfter;
  return <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${result.failed ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50/70 text-emerald-900"}`}>
    <div className="flex items-start justify-between gap-3">
      <p className="font-semibold">
        {result.failed ? "The recheck could not finish" : `Rechecked at ${new Date(result.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
        {!result.failed && (scoreMoved ? `. Website score ${result.scoreBefore} to ${result.scoreAfter}.` : result.scoreAfter !== null ? `. Website score unchanged at ${result.scoreAfter}.` : ".")}
      </p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded-lg p-0.5 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
    </div>
    {result.failed ? <p className="mt-1">{result.failed}</p> : <>
      {!result.added.length && !result.removed.length && <p className="mt-1">The website findings are the same as before.</p>}
      {result.added.length > 0 && <div className="mt-2"><p className="text-xs font-semibold">New findings</p><ul className="mt-1 list-disc pl-4">{result.added.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {result.removed.length > 0 && <div className="mt-2"><p className="text-xs font-semibold">No longer found</p><ul className="mt-1 list-disc pl-4">{result.removed.map((item) => <li key={item} className="line-through opacity-70">{item}</li>)}</ul></div>}
      {result.editedKept.length > 0 && <p className="mt-2 text-xs">Your corrections were kept. Use "Reset to research" on a section to see what the recheck found there.</p>}
    </>}
  </div>;
}

function RowButton({ label, icon: Icon, onClick, busy, disabled, active, tone, iconOnly, title }: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  active?: boolean;
  tone?: "danger";
  iconOnly?: boolean;
  title?: string;
}) {
  const base = tone === "danger"
    ? "border border-slate-200 text-rose-600 hover:border-rose-300"
    : active
      ? "border border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]"
      : "border border-slate-200 text-slate-700 hover:border-[#0A4FE8]";
  return <button type="button" onClick={onClick} disabled={busy || disabled} aria-label={label} title={title || label} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold disabled:opacity-50 ${base}`}>
    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    {!iconOnly && <span className="hidden sm:inline">{label}</span>}
  </button>;
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) { return <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
