 
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Loader2, Pencil, Plus, Trash2, UsersRound, X } from "lucide-react";
import { appConfirm } from "@/lib/app-notify";

type Prospect = { id: string; research_brief: string | null; category: string; display_name: string; company_name: string | null; website: string | null; social_url: string | null; email: string | null; phone: string | null; location: string | null; notes: string | null; next_action: string | null; follow_up_at: string | null; status: string; updated_at: string };
type ProspectForm = Omit<Prospect, "id" | "updated_at"> & { id?: string };
const EMPTY: ProspectForm = { research_brief: "", category: "potential_client", display_name: "", company_name: "", website: "", social_url: "", email: "", phone: "", location: "", notes: "", next_action: "", follow_up_at: "", status: "to_research" };
const CATEGORIES = [{ value: "potential_client", label: "Potential clients" }, { value: "investor", label: "Investors" }, { value: "influencer", label: "Influencers" }, { value: "industry_leader", label: "Industry leaders" }];
const STATUSES = [{ value: "to_research", label: "To research" }, { value: "ready", label: "Ready" }, { value: "contacted", label: "Contacted" }, { value: "follow_up", label: "Follow up" }, { value: "converted", label: "Converted" }, { value: "not_relevant", label: "Not relevant" }];

function formFrom(prospect: Prospect): ProspectForm { return { ...prospect, research_brief: prospect.research_brief || "", company_name: prospect.company_name || "", website: prospect.website || "", social_url: prospect.social_url || "", email: prospect.email || "", phone: prospect.phone || "", location: prospect.location || "", notes: prospect.notes || "", next_action: prospect.next_action || "", follow_up_at: prospect.follow_up_at ? new Date(prospect.follow_up_at).toISOString().slice(0, 16) : "" }; }

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
   * A proposal for this prospect, seeded from what the checklist already holds:
   * their next action, our notes, and the research brief behind them.
   */
  const draftProposal = async (prospect: Prospect) => {
    if (!prospect.website && !prospect.social_url) {
      setNotice({ tone: "error", text: `${prospect.display_name} needs a website or social link before a proposal can be built.` });
      return;
    }
    setBusy(`proposal:${prospect.id}`);
    setNotice({ tone: "success", text: `Researching and writing a proposal for ${prospect.company_name || prospect.display_name}. This takes a moment.` });
    try {
      const response = await fetch("/api/admin/deals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_proposal", from_prospect_id: prospect.id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "The proposal could not be generated.");
      const proposalId = typeof json.proposal?.id === "string" ? json.proposal.id : "";
      if (!proposalId) throw new Error("The proposal finished without an ID.");
      router.push(`/admin/deals/proposals?proposal=${encodeURIComponent(proposalId)}`);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The proposal could not be generated." });
    } finally { setBusy(""); }
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
    {loading ? <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div> : visible.length === 0 ? <div className="grid min-h-72 place-items-center rounded-[24px] border border-dashed border-slate-200 bg-white text-center"><div><UsersRound className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm text-slate-400">No prospects in this category.</p></div></div> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((prospect) => <article key={prospect.id} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#0A4FE8]">{STATUSES.find((item) => item.value === prospect.status)?.label}</span><h2 className="mt-3 truncate text-lg font-bold text-[#07133B]">{prospect.display_name}</h2><p className="truncate text-sm text-slate-400">{prospect.company_name || CATEGORIES.find((item) => item.value === prospect.category)?.label}</p></div><div className="flex gap-1"><button disabled={busy === `proposal:${prospect.id}`} onClick={() => draftProposal(prospect)} aria-label={`Draft a proposal for ${prospect.display_name}`} title={`Draft a proposal for ${prospect.display_name}`} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-blue-50 hover:text-[#0A4FE8] disabled:opacity-40">{busy === `proposal:${prospect.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}</button><button onClick={() => edit(prospect)} aria-label="Edit prospect" className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-blue-50 hover:text-[#0A4FE8]"><Pencil className="h-4 w-4" /></button><button disabled={busy === prospect.id} onClick={() => remove(prospect)} aria-label="Remove prospect" className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600">{busy === prospect.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></div></div>{prospect.next_action && <div className="mt-4 rounded-2xl bg-[#F3F6FC] p-3"><span className="text-[11px] font-semibold text-slate-400">Next action</span><p className="mt-1 text-sm text-slate-600">{prospect.next_action}</p></div>}<div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-[#0A4FE8]">{prospect.website && <a href={prospect.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Website</a>}{prospect.social_url && <a href={prospect.social_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Social</a>}{prospect.email && <a href={`mailto:${prospect.email}`}>{prospect.email}</a>}</div>{prospect.follow_up_at && <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">Follow up {new Date(prospect.follow_up_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>}</article>)}</section>}

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
            <label className="md:col-span-2 xl:col-span-4">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Research brief</span>
              <span className="mb-1.5 block text-xs text-slate-400">Copied from prospect generation when this company was added. Yours to edit: correct anything the research got wrong and add your own findings.</span>
              <textarea rows={12} value={form.research_brief || ""} onChange={(event) => setForm({ ...form, research_brief: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs leading-5 outline-none focus:border-[#0A4FE8]" />
            </label>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <button type="button" onClick={() => setFormOpen(false)} disabled={busy === "save"} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-40">Close</button>
          <button disabled={busy === "save"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white disabled:opacity-60">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : form.id ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{form.id ? "Save now" : "Add prospect"}</button>
        </div>
      </form>
    </div>}
  </main>;
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) { return <label><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
