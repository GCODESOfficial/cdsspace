"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  BadgeCheck,
  Cake,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  MessageSquareWarning,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { HR_RECORD_TYPES, HR_RECORD_TYPE_LABELS, type HrRecordStatus, type HrRecordType } from "@/lib/hr-personnel";

type Member = {
  id: string;
  full_name: string;
  email: string;
  role_title?: string | null;
  department?: string | null;
  date_of_birth?: string | null;
};

type Birthday = Member & {
  birthday_reminder_days: number;
  birthday_last_celebrated_year?: number | null;
  birthday?: { nextDate: string; daysUntil: number; year: number } | null;
};

type RecordRow = {
  id: string;
  record_number: string;
  team_member_id: string;
  record_type: HrRecordType;
  title: string;
  summary: string;
  status: HrRecordStatus;
  event_date: string;
  effective_date?: string | null;
  due_at?: string | null;
  signed_at?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  full_name: string;
  department?: string | null;
  created_by: string;
};

type Draft = {
  team_member_id: string;
  record_type: HrRecordType;
  title: string;
  summary: string;
  status: HrRecordStatus;
  event_date: string;
  effective_date: string;
  due_at: string;
  signed_at: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_DRAFT: Draft = {
  team_member_id: "",
  record_type: "employment_contract",
  title: "",
  summary: "",
  status: "issued",
  event_date: today(),
  effective_date: "",
  due_at: "",
  signed_at: "",
};

export default function HrCompliancePage() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [stats, setStats] = useState({ total: 0, signed: 0, open_queries: 0, due_birthdays: 0 });
  const [capabilities, setCapabilities] = useState({ financial: false });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const draftReady = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/hr/compliance", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load HR compliance.");
      setRecords(payload.records || []);
      setMembers(payload.members || []);
      setBirthdays(payload.birthdays || []);
      setStats(payload.stats || { total: 0, signed: 0, open_queries: 0, due_birthdays: 0 });
      setCapabilities(payload.capabilities || { financial: false });
      if (!draftReady.current) {
        const restored = payload.draft?.payload && typeof payload.draft.payload === "object" ? payload.draft.payload : null;
        const queryMember = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("member_id") : null;
        setDraft({ ...EMPTY_DRAFT, ...(restored || {}), ...(queryMember ? { team_member_id: queryMember } : {}) });
        setShowForm(Boolean(restored || queryMember));
        draftReady.current = true;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load HR compliance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!draftReady.current || !showForm) return;
    setDraftState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/hr/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_draft", payload: draft }),
        });
        if (!response.ok) throw new Error("Draft save failed");
        setDraftState("saved");
      } catch {
        setDraftState("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, showForm]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const typeMatch = typeFilter === "all" || record.record_type === typeFilter;
      const searchMatch = !query || [record.full_name, record.title, record.summary, record.record_number, record.department]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return typeMatch && searchMatch;
    });
  }, [records, search, typeFilter]);

  const visibleTypes = capabilities.financial ? HR_RECORD_TYPES : HR_RECORD_TYPES.filter((type) => type !== "bank_statement");

  async function submitRecord(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      let response: Response;
      if (file) {
        const form = new FormData();
        Object.entries(draft).forEach(([key, value]) => form.set(key, value));
        form.set("file", file);
        response = await fetch("/api/admin/hr/compliance/upload", { method: "POST", body: form });
      } else {
        response = await fetch("/api/admin/hr/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create_record", ...draft }),
        });
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save the HR record.");
      toast.success("HR record saved.");
      setDraft(EMPTY_DRAFT);
      setFile(null);
      setShowForm(false);
      setDraftState("idle");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the HR record.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(record: RecordRow, status: HrRecordStatus) {
    const response = await fetch("/api/admin/hr/compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_status", id: record.id, status }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) return toast.error(payload.error || "Could not update the record.");
    toast.success("HR record updated.");
    await load();
  }

  async function markCelebrated(member: Birthday) {
    if (!member.birthday) return;
    const response = await fetch("/api/admin/hr/compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_birthday_celebrated", team_member_id: member.id, year: member.birthday.year }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) return toast.error(payload.error || "Could not update the birthday reminder.");
    toast.success(`${member.full_name}'s celebration is recorded.`);
    await load();
  }

  async function closeForm(discard = false) {
    if (discard) {
      await fetch("/api/admin/hr/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard_draft" }),
      }).catch(() => undefined);
      setDraft(EMPTY_DRAFT);
      setFile(null);
      setDraftState("idle");
    }
    setShowForm(false);
  }

  if (loading) return <div className="grid min-h-[65vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#0A4FE8]">HRM</p>
          <h1 className="text-[28px] font-bold tracking-tight text-[#0D1B39]">HR compliance</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-slate-500">Secure personnel documents, signed agreements, employment actions, queries, appreciation notes, and birthday reminders.</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white hover:bg-[#083EC0]">
          <Plus className="h-4 w-4" /> Add HR record
        </button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={FileCheck2} label="Active records" value={stats.total} />
        <StatCard icon={BadgeCheck} label="Signed documents" value={stats.signed} />
        <StatCard icon={MessageSquareWarning} label="Open queries" value={stats.open_queries} />
        <StatCard icon={Cake} label="Birthday reminders" value={stats.due_birthdays} />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#0D1B39]">Upcoming birthdays</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Reminder timing is configured on each team member's profile.</p>
          </div>
          <Link href="/admin/team-members" className="text-[12px] font-semibold text-[#0A4FE8]">Manage team profiles</Link>
        </div>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {birthdays.length ? birthdays.slice(0, 12).map((member) => {
            const due = Number(member.birthday?.daysUntil || 0) <= Number(member.birthday_reminder_days || 14);
            const celebrated = member.birthday_last_celebrated_year === member.birthday?.year;
            return (
              <article key={member.id} className={`min-w-[240px] rounded-2xl border p-4 ${due ? "border-blue-200 bg-blue-50/50" : "border-slate-100 bg-slate-50/70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <Cake className="h-5 w-5 text-[#0A4FE8]" />
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">{member.birthday?.daysUntil === 0 ? "Today" : `${member.birthday?.daysUntil} days`}</span>
                </div>
                <p className="mt-3 truncate text-[13px] font-semibold text-[#0D1B39]">{member.full_name}</p>
                <p className="text-[11px] text-slate-500">{new Date(`${member.birthday?.nextDate}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long" })}</p>
                <button type="button" disabled={celebrated} onClick={() => void markCelebrated(member)} className="mt-3 text-[11px] font-semibold text-[#0A4FE8] disabled:text-emerald-600">
                  {celebrated ? "Celebration recorded" : "Mark celebration arranged"}
                </button>
              </article>
            );
          }) : <p className="py-5 text-[12px] text-slate-400">Add birthdays from a team member profile to receive reminders here.</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-[#0D1B39]">Personnel register</h2>
            <p className="text-[12px] text-slate-500">Every update is retained in the record's audit history.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-[12px] outline-none focus:border-blue-300 sm:w-64" />
            </label>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-[12px] text-slate-600 outline-none focus:border-blue-300">
              <option value="all">All record types</option>
              {visibleTypes.map((type) => <option key={type} value={type}>{HR_RECORD_TYPE_LABELS[type]}</option>)}
            </select>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.length ? filtered.map((record) => (
            <article key={record.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-[#0A4FE8]">{HR_RECORD_TYPE_LABELS[record.record_type]}</span>
                  <span className="text-[10px] text-slate-400">{record.record_number}</span>
                  <Status status={record.status} />
                </div>
                <h3 className="mt-2 text-[14px] font-semibold text-[#0D1B39]">{record.title}</h3>
                <p className="mt-0.5 text-[12px] text-slate-600">{record.full_name}{record.department ? ` · ${record.department}` : ""}</p>
                {record.summary && <p className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-slate-500">{record.summary}</p>}
                <p className="mt-2 text-[10.5px] text-slate-400">Dated {new Date(`${record.event_date}T12:00:00Z`).toLocaleDateString()} · Added by {record.created_by}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {record.file_url && <a href={record.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:border-blue-200 hover:text-[#0A4FE8]"><Download className="h-3.5 w-3.5" /> Open</a>}
                {record.status === "issued" && <button type="button" onClick={() => void updateStatus(record, "acknowledged")} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-blue-200 px-3 text-[11px] font-semibold text-[#0A4FE8]"><BadgeCheck className="h-3.5 w-3.5" /> Acknowledge</button>}
                {(record.status === "issued" || record.status === "acknowledged") && <button type="button" onClick={() => void updateStatus(record, "resolved")} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 px-3 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Resolve</button>}
                {record.status !== "archived" && <button type="button" onClick={() => void updateStatus(record, "archived")} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400" aria-label={`Archive ${record.title}`}><Archive className="h-3.5 w-3.5" /></button>}
              </div>
            </article>
          )) : <p className="p-10 text-center text-[13px] text-slate-400">No personnel records match this view.</p>}
        </div>
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) void closeForm(false); }}>
          <form onSubmit={submitRecord} className="my-auto w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><ShieldCheck className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><h2 className="text-[17px] font-semibold text-[#0D1B39]">Add HR record</h2><p className="text-[11.5px] text-slate-500">Your form is saved quietly until this record is completed.</p></div>
              <div className="flex items-center gap-2"><span className={`text-[10px] ${draftState === "error" ? "text-rose-600" : "text-slate-400"}`}>{draftState === "saving" ? "Saving" : draftState === "saved" ? "Saved" : draftState === "error" ? "Save failed" : ""}</span><button type="button" onClick={() => void closeForm(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><X className="h-4 w-4" /></button></div>
            </div>
            <div className="max-h-[72dvh] space-y-4 overflow-y-auto px-5 py-5 md:px-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Team member"><select required value={draft.team_member_id} onChange={(event) => setDraft((value) => ({ ...value, team_member_id: event.target.value }))} className="field"><option value="">Choose a team member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></Field>
                <Field label="Record type"><select required value={draft.record_type} onChange={(event) => setDraft((value) => ({ ...value, record_type: event.target.value as HrRecordType }))} className="field">{visibleTypes.map((type) => <option key={type} value={type}>{HR_RECORD_TYPE_LABELS[type]}</option>)}</select></Field>
              </div>
              <Field label="Title"><input required maxLength={220} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} className="field" placeholder="Clear document or action title" /></Field>
              <Field label="Details or reason"><textarea rows={4} value={draft.summary} onChange={(event) => setDraft((value) => ({ ...value, summary: event.target.value }))} className="field resize-y" placeholder="Record the context, decision, expectations, or response." /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Record date"><input type="date" required value={draft.event_date} onChange={(event) => setDraft((value) => ({ ...value, event_date: event.target.value }))} className="field" /></Field>
                <Field label="Effective date"><input type="date" value={draft.effective_date} onChange={(event) => setDraft((value) => ({ ...value, effective_date: event.target.value }))} className="field" /></Field>
                <Field label="Response due"><input type="datetime-local" value={draft.due_at} onChange={(event) => setDraft((value) => ({ ...value, due_at: event.target.value }))} className="field" /></Field>
                <Field label="Signed on"><input type="datetime-local" value={draft.signed_at} onChange={(event) => setDraft((value) => ({ ...value, signed_at: event.target.value }))} className="field" /></Field>
              </div>
              <Field label="Document"><label className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4 text-center"><Upload className="h-5 w-5 text-[#0A4FE8]" /><span className="text-[12px] text-slate-600">{file ? file.name : "Upload a PDF, DOCX, XLSX, PPTX, or image"}</span><input type="file" className="hidden" accept=".pdf,.docx,.xlsx,.pptx,image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:px-6">
              <button type="button" onClick={() => void closeForm(true)} className="text-[12px] font-semibold text-slate-500 hover:text-rose-600">Discard draft</button>
              <button type="submit" disabled={submitting} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13px] font-semibold text-white disabled:opacity-60">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Save HR record</button>
            </div>
          </form>
        </div>
      )}

      <style jsx>{`.field{width:100%;border:1px solid #e2e8f0;border-radius:.75rem;background:#fff;padding:.7rem .8rem;font-size:.78rem;color:#334155;outline:none}.field:focus{border-color:#93c5fd;box-shadow:0 0 0 3px rgba(59,130,246,.1)}`}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">{label}</span>{children}</label>;
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Icon className="h-4 w-4" /></span><p className="mt-3 text-2xl font-semibold text-[#0D1B39]">{value}</p><p className="text-[11px] text-slate-500">{label}</p></article>;
}

function Status({ status }: { status: HrRecordStatus }) {
  const styles: Record<HrRecordStatus, string> = { draft: "bg-slate-100 text-slate-600", issued: "bg-amber-50 text-amber-700", acknowledged: "bg-blue-50 text-[#0A4FE8]", resolved: "bg-emerald-50 text-emerald-700", archived: "bg-slate-100 text-slate-400" };
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${styles[status]}`}><Clock3 className="mr-1 inline h-3 w-3" />{status.replace("_", " ")}</span>;
}
