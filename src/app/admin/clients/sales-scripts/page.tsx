"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  Check,
  Copy,
  Loader2,
  Megaphone,
  MessageSquareText,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";
import { appAlert, appConfirm, appToast } from "@/lib/app-notify";

type Category = "sales" | "marketing" | "client_experience";
type ScriptStatus = "draft" | "published" | "archived";

type SalesScript = {
  id: string;
  source_script_id: string | null;
  category: Category;
  title: string;
  script_text: string;
  use_case: string | null;
  channel: string;
  stage: string;
  market: string;
  language: string;
  tags: string[];
  status: ScriptStatus;
  sort_order: number;
  created_by: string;
  updated_at: string;
};

type ScriptForm = {
  category: Category;
  title: string;
  scriptText: string;
  useCase: string;
  channel: string;
  stage: string;
  market: string;
  language: string;
  tags: string;
  sortOrder: number;
};

const EMPTY: ScriptForm = {
  category: "sales",
  title: "",
  scriptText: "",
  useCase: "",
  channel: "Any channel",
  stage: "Opening",
  market: "Global",
  language: "English",
  tags: "",
  sortOrder: 100,
};

const CATEGORIES: Array<{ key: Category; label: string; description: string; icon: typeof ShoppingBag }> = [
  { key: "sales", label: "Sales", description: "Prospecting, discovery, follow-up and closing lines.", icon: ShoppingBag },
  { key: "marketing", label: "Marketing", description: "Campaign, partnership and re-engagement messaging.", icon: Megaphone },
  { key: "client_experience", label: "Client experience", description: "Consistent onboarding, updates and service recovery.", icon: MessageSquareText },
];
const CHANNELS = ["Any channel", "Phone call", "WhatsApp", "Email", "Social message", "In person"];
const STAGES = ["Opening", "Discovery", "Follow-up", "Objection handling", "Closing", "Onboarding", "Service recovery"];
const INPUT = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0D1B39] outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50";

function fromScript(script: SalesScript): ScriptForm {
  return {
    category: script.category,
    title: script.title,
    scriptText: script.script_text,
    useCase: script.use_case || "",
    channel: script.channel,
    stage: script.stage,
    market: script.market,
    language: script.language,
    tags: (script.tags || []).join(", "),
    sortOrder: script.sort_order,
  };
}

function categoryLabel(category: Category) {
  return CATEGORIES.find((item) => item.key === category)?.label || category;
}

export default function SalesScriptsPage() {
  const [scripts, setScripts] = useState<SalesScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ScriptForm>(EMPTY);
  const [source, setSource] = useState<SalesScript | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [publishing, setPublishing] = useState(false);
  const draftReady = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/sales-scripts", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Sales scripts could not be loaded.");
      setScripts(payload.scripts || []);
    } catch (error) {
      await appAlert({ title: "Sales scripts", message: error instanceof Error ? error.message : "Could not load the script library.", kind: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!formOpen || !draftReady.current) return;
    if (!form.title.trim() && !form.scriptText.trim() && !form.useCase.trim()) return;
    setDraftState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/sales-scripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_draft", id: draftId, sourceId: source?.id || null, ...form }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Draft save failed.");
        setDraftId(payload.id);
        setDraftState("saved");
      } catch {
        setDraftState("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draftId, form, formOpen, source?.id]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scripts.filter((script) => {
      if (script.status === "draft") return false;
      if ((script.status === "archived") !== showArchived) return false;
      if (category !== "all" && script.category !== category) return false;
      if (!needle) return true;
      return [script.title, script.script_text, script.use_case, script.channel, script.stage, script.market, script.language, ...(script.tags || [])]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [category, query, scripts, showArchived]);

  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((item) => [item.key, scripts.filter((script) => script.category === item.key && script.status === "published").length])), [scripts]);
  const currentDraft = scripts.find((script) => script.status === "draft") || null;

  function openNew() {
    draftReady.current = false;
    setSource(null);
    if (currentDraft) {
      const original = currentDraft.source_script_id ? scripts.find((script) => script.id === currentDraft.source_script_id) || null : null;
      setSource(original);
      setDraftId(currentDraft.id);
      setForm(fromScript(currentDraft));
      setDraftState("saved");
    } else {
      setDraftId(null);
      setForm(EMPTY);
      setDraftState("idle");
    }
    setFormOpen(true);
    requestAnimationFrame(() => { draftReady.current = true; });
  }

  function openEdit(script: SalesScript) {
    draftReady.current = false;
    setSource(script);
    if (currentDraft?.source_script_id === script.id) {
      setDraftId(currentDraft.id);
      setForm(fromScript(currentDraft));
      setDraftState("saved");
    } else {
      setDraftId(null);
      setForm(fromScript(script));
      setDraftState("idle");
    }
    setFormOpen(true);
    requestAnimationFrame(() => { draftReady.current = true; });
  }

  async function publish() {
    setPublishing(true);
    try {
      let activeDraftId = draftId;
      if (!activeDraftId) {
        const draftResponse = await fetch("/api/admin/sales-scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_draft", sourceId: source?.id || null, ...form }) });
        const draftPayload = await draftResponse.json().catch(() => ({}));
        if (!draftResponse.ok) throw new Error(draftPayload.error || "Could not prepare the draft.");
        activeDraftId = draftPayload.id;
      }
      const response = await fetch("/api/admin/sales-scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", id: activeDraftId, ...form }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not publish the sales script.");
      setFormOpen(false);
      draftReady.current = false;
      await load();
      appToast({ title: source ? "Script updated" : "Script published", message: "The approved wording is now available in Sales Hub.", kind: "success" });
    } catch (error) {
      await appAlert({ title: "Sales script", message: error instanceof Error ? error.message : "Could not publish the script.", kind: "error" });
    } finally {
      setPublishing(false);
    }
  }

  async function changeStatus(script: SalesScript, action: "archive" | "restore") {
    if (action === "archive" && !(await appConfirm({ title: "Archive sales script?", message: `Archive “${script.title}”? It will leave the active library but can be restored.`, confirmLabel: "Archive" }))) return;
    try {
      const response = await fetch("/api/admin/sales-scripts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: script.id, action }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update the script.");
      await load();
    } catch (error) {
      await appAlert({ title: "Sales script", message: error instanceof Error ? error.message : "Could not update the script.", kind: "error" });
    }
  }

  async function copyScript(script: SalesScript) {
    try {
      await navigator.clipboard.writeText(script.script_text);
      appToast({ title: "Script copied", message: "The approved wording is ready to paste.", kind: "success" });
    } catch {
      await appAlert({ title: "Copy script", message: "Your browser blocked clipboard access. Select and copy the wording manually.", kind: "warning" });
    }
  }

  return (
    <main className="mx-auto max-w-[1440px] p-4 sm:p-7 lg:p-9">
      <header className="rounded-[28px] bg-[#0A4FE8] px-6 py-8 text-white shadow-[0_20px_60px_rgba(10,79,232,0.18)] sm:px-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-xs font-semibold text-blue-100"><BookOpen className="h-4 w-4" />Sales Hub</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Sales scripts</h1>
            <p className="mt-3 text-sm leading-6 text-blue-100">The approved CDS Space conversation library for sales, marketing and a consistent global client experience.</p>
          </div>
          <button type="button" onClick={openNew} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-[#0A4FE8] shadow-lg transition hover:bg-blue-50"><Plus className="h-4 w-4" />New sales script</button>
        </div>
      </header>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        {CATEGORIES.map((item) => <button key={item.key} type="button" onClick={() => { setCategory(item.key); setShowArchived(false); }} className={`rounded-[22px] border bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md ${category === item.key && !showArchived ? "border-blue-300 ring-4 ring-blue-50" : "border-slate-200"}`}><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-[#0A4FE8]"><item.icon className="h-5 w-5" /></span><strong className="text-2xl text-[#0D1B39]">{counts[item.key] || 0}</strong></div><h2 className="mt-4 text-base font-semibold text-[#0D1B39]">{item.label}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p></button>)}
      </section>

      <section className="mt-5 rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative min-w-0 flex-1 sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wording, use case or channel" className={`${INPUT} pl-10`} /></div>
          <div className="flex flex-wrap gap-2">
            <select value={category} onChange={(event) => setCategory(event.target.value as "all" | Category)} className={`${INPUT} w-auto min-w-36`} aria-label="Script category"><option value="all">All categories</option>{CATEGORIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
            <button type="button" onClick={() => setShowArchived((value) => !value)} className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-xs font-semibold ${showArchived ? "border-blue-200 bg-blue-50 text-[#0A4FE8]" : "border-slate-200 text-slate-600"}`}>{showArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{showArchived ? "Back to active" : "Archived"}</button>
          </div>
        </div>

        {currentDraft && <button type="button" onClick={openNew} className="m-4 flex w-[calc(100%-2rem)] items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left sm:m-5 sm:w-[calc(100%-2.5rem)]"><span><strong className="block text-sm text-amber-900">Continue your saved draft</strong><span className="mt-1 block text-xs text-amber-700">{currentDraft.title || "Untitled sales script"} · Saved {new Date(currentDraft.updated_at).toLocaleString()}</span></span><PenLine className="h-5 w-5 shrink-0 text-amber-700" /></button>}

        {loading ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div> : visible.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><BookOpen className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-[#0D1B39]">No scripts match this view</p><p className="mt-1 text-xs text-slate-500">Change the filters or add approved wording for this category.</p></div></div> : <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3 sm:p-5">{visible.map((script) => <article key={script.id} className="flex min-w-0 flex-col rounded-[20px] border border-slate-200 p-5 transition hover:border-blue-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-[#0A4FE8]">{categoryLabel(script.category)}</span><h2 className="mt-3 text-base font-semibold text-[#0D1B39]">{script.title}</h2></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${script.status === "archived" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{script.status === "archived" ? "Archived" : "Approved"}</span></div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{script.script_text}</p>{script.use_case && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Use when:</strong> {script.use_case}</p>}<div className="mt-4 flex flex-wrap gap-1.5 text-[10px] text-slate-500"><span className="rounded-lg border border-slate-200 px-2 py-1">{script.channel}</span><span className="rounded-lg border border-slate-200 px-2 py-1">{script.stage}</span><span className="rounded-lg border border-slate-200 px-2 py-1">{script.market}</span><span className="rounded-lg border border-slate-200 px-2 py-1">{script.language}</span></div><div className="mt-auto flex gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => copyScript(script)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-3 text-xs font-semibold text-white hover:bg-[#0844c9]"><Copy className="h-4 w-4" />Copy</button>{script.status === "published" ? <><button type="button" onClick={() => openEdit(script)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label={`Edit ${script.title}`}><PenLine className="h-4 w-4" /></button><button type="button" onClick={() => changeStatus(script, "archive")} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label={`Archive ${script.title}`}><Archive className="h-4 w-4" /></button></> : <button type="button" onClick={() => changeStatus(script, "restore")} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-semibold text-[#0A4FE8] hover:bg-blue-50"><RotateCcw className="h-4 w-4" />Restore</button>}</div></article>)}</div>}
      </section>

      {formOpen && <div className="fixed inset-0 z-[160] grid place-items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><section role="dialog" aria-modal="true" aria-label={source ? "Edit sales script" : "New sales script"} className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:max-w-3xl sm:rounded-[28px]"><header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-5 sm:px-7"><div><p className="text-xs font-semibold text-[#0A4FE8]">{source ? "Edit approved wording" : "New library entry"}</p><h2 className="mt-1 text-xl font-semibold text-[#0D1B39]">{source ? source.title : "Create a sales script"}</h2><p className={`mt-1 text-[11px] ${draftState === "error" ? "text-rose-600" : "text-slate-400"}`}>{draftState === "saving" ? "Saving draft…" : draftState === "saved" ? "Draft saved" : draftState === "error" ? "Draft could not be saved" : "Changes autosave as a private draft"}</p></div><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close script editor"><X className="h-5 w-5" /></button></header><div className="space-y-5 p-5 sm:p-7"><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5"><span className="text-xs font-semibold text-[#0D1B39]">Category</span><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as Category }))} className={INPUT}>{CATEGORIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label className="space-y-1.5"><span className="text-xs font-semibold text-[#0D1B39]">Title</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Example: Open a first conversation" className={INPUT} /></label></div><label className="block space-y-1.5"><span className="text-xs font-semibold text-[#0D1B39]">Approved wording</span><textarea value={form.scriptText} onChange={(event) => setForm((current) => ({ ...current, scriptText: event.target.value }))} rows={7} placeholder="Write the exact wording. Use placeholders such as [Name], [Company] or [Goal]." className={`${INPUT} h-auto min-h-44 resize-y py-3 leading-6`} /></label><label className="block space-y-1.5"><span className="text-xs font-semibold text-[#0D1B39]">Usage guidance</span><textarea value={form.useCase} onChange={(event) => setForm((current) => ({ ...current, useCase: event.target.value }))} rows={3} placeholder="Explain when this script should be used." className={`${INPUT} h-auto resize-y py-3`} /></label><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="space-y-1.5"><span className="text-xs font-semibold text-[#0D1B39]">Channel</span><select value={form.channel} onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))} className={INPUT}>{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="space-y-1.5"><span className="text-xs font-semibold text-[#0D1B39]">Stage</span><select value={form.stage} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))} className={INPUT}>{STAGES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="space-y-1.5"><span className="text-xs font-semibold text-[#0D1B39]">Market</span><input value={form.market} onChange={(event) => setForm((current) => ({ ...current, market: event.target.value }))} className={INPUT} /></label><label className="space-y-1.5"><span className="text-xs font-semibold text-[#0D1B39]">Language</span><input value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))} className={INPUT} /></label></div><label className="block space-y-1.5"><span className="text-xs font-semibold text-[#0D1B39]">Tags</span><input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="prospecting, onboarding, follow-up" className={INPUT} /></label><div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p>Publish only approved CDS Space wording. Personalise placeholders and verify the recipient context before use.</p></div></div><footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7"><button type="button" onClick={() => setFormOpen(false)} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Close</button><button type="button" onClick={publish} disabled={publishing} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white hover:bg-[#0844c9] disabled:opacity-60">{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{source ? "Publish update" : "Publish script"}</button></footer></section></div>}
    </main>
  );
}
