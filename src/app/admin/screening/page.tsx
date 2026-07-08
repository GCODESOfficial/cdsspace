"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { appToast, appConfirm } from "@/lib/app-notify";
import QuestionBankEditor from "@/components/screening/QuestionBankEditor";
import {
  GraduationCap, Loader2, CalendarClock, MapPin, Backpack, Search,
  ClipboardList, Wrench, Mic, X, CheckCircle2, Ban, AlertTriangle, RotateCcw,
  Save, ListChecks, Power, Lock, UserPlus,
} from "lucide-react";

/* ─────────────── Types ─────────────── */
interface Candidate {
  id: string;
  application_id: string;
  role_id: string | null;
  email: string;
  full_name: string;
  scheduled_at: string | null;
  location: string | null;
  bring_items: string | null;
  instructions: string | null;
  objective_status: "not_started" | "in_progress" | "submitted" | "terminated";
  objective_score: number | null;
  objective_total: number | null;
  termination_reason: string | null;
  warning_count: number;
  objective_unlocked: boolean;
  practical_status: "pending" | "rated";
  practical_score: number | null;
  practical_feedback: string | null;
  interview_status: "pending" | "rated";
  interview_score: number | null;
  interview_feedback: string | null;
  decision: "in_progress" | "passed" | "failed";
  application_status: string;
  tracking_code: string | null;
  role_title: string | null;
  role_type: string | null;
  role_location: string | null;
}

interface Role { id: string; title: string; role_type: string; is_active: boolean }
interface RoleInterview { role_id: string; interview_at: string | null; venue: string | null; notes: string | null }
interface RoleSchedule { role_id: string; scheduled_at: string | null; location: string | null; bring_items: string | null; instructions: string | null }

const ACCENT = "#0A4FE8";

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/* ═══════════════ Page ═══════════════ */
export default function AdminScreeningPage() {
  const [tab, setTab] = useState<"candidates" | "questions">("candidates");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0A4FE8]">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Applicant Screening</h1>
          <p className="text-sm text-gray-500">Schedule screenings, set objective questions, and rate practical & interview tests.</p>
        </div>
      </div>

      <div className="mb-6 inline-flex rounded-xl bg-gray-100 p-1">
        {([["candidates", "Candidates", ListChecks], ["questions", "Question Bank", ClipboardList]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === key ? "bg-white text-[#0A4FE8] shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "candidates" ? <CandidatesTab /> : <QuestionBankTab />}
    </div>
  );
}

/* ═══════════════ Candidates ═══════════════ */
function CandidatesTab() {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Record<string, RoleInterview>>({});
  const [schedules, setSchedules] = useState<Record<string, RoleSchedule>>({});
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Candidate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/screening", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        setCandidates(data.candidates);
        const map: Record<string, RoleInterview> = {};
        for (const iv of (data.interviews || []) as RoleInterview[]) map[iv.role_id] = iv;
        setInterviews(map);
        const smap: Record<string, RoleSchedule> = {};
        for (const s of (data.schedules || []) as RoleSchedule[]) smap[s.role_id] = s;
        setSchedules(smap);
      } else appToast({ message: data?.error || "Failed to load", kind: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return candidates;
    return candidates.filter((c) =>
      [c.full_name, c.email, c.role_title, c.tracking_code].filter(Boolean).join(" ").toLowerCase().includes(s),
    );
  }, [candidates, q]);

  // Group candidates by the role they applied for, so multiple roles read clearly.
  const groups = useMemo(() => {
    const map = new Map<string, { roleId: string | null; title: string; items: Candidate[] }>();
    for (const c of filtered) {
      const key = c.role_id || "none";
      const title = c.role_title || "No role";
      if (!map.has(key)) map.set(key, { roleId: c.role_id, title, items: [] });
      map.get(key)!.items.push(c);
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [filtered]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>;
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, code…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0A4FE8]"
          />
        </div>
        <span className="text-sm text-gray-400">{filtered.length} candidate{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
          No screening candidates yet. Shortlist an applicant on the Applications page to see them here.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">{g.title}</h3>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{g.items.length}</span>
              </div>
              {g.roleId && (
                <RoleScheduleEditor
                  roleId={g.roleId}
                  count={g.items.length}
                  schedule={schedules[g.roleId]}
                  interview={interviews[g.roleId]}
                  onSaved={load}
                />
              )}
              <div className="space-y-3">
                {g.items.map((c) => (
                  <CandidateRow key={c.id} c={c} onOpen={() => setActive(c)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {active && <CandidateDrawer candidate={active} onClose={() => setActive(null)} onSaved={() => { load(); setActive(null); }} />}
    </>
  );
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-500",
    in_progress: "bg-blue-50 text-[#0A4FE8]",
    submitted: "bg-emerald-50 text-emerald-700",
    terminated: "bg-rose-50 text-rose-700",
    pending: "bg-amber-50 text-amber-700",
    rated: "bg-emerald-50 text-emerald-700",
  };
  return map[status] || "bg-gray-100 text-gray-500";
}

function CandidateRow({ c, onOpen }: { c: Candidate; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-[#0A4FE8]/30 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-gray-900">{c.full_name}</p>
          {c.application_status !== "shortlisted" && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-600">{c.application_status}</span>
          )}
        </div>
        <p className="truncate text-xs text-gray-400">{c.email} · {c.role_title || "No role"} · {c.tracking_code}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusPill(c.objective_status)}`}>
          <ClipboardList className="h-3 w-3" /> {c.objective_status === "submitted" && c.objective_score != null ? `${c.objective_score}/${c.objective_total}` : c.objective_status.replace("_", " ")}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusPill(c.practical_status)}`}>
          <Wrench className="h-3 w-3" /> {c.practical_status === "rated" ? `${c.practical_score}/100` : "practical"}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusPill(c.interview_status)}`}>
          <Mic className="h-3 w-3" /> {c.interview_status === "rated" ? `${c.interview_score}/100` : "interview"}
        </span>
        {c.scheduled_at && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-500">
            <CalendarClock className="h-3 w-3" /> {fmtDate(c.scheduled_at)}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─────── Per-role schedule (applies to everyone in the role) ─────── */
function RoleScheduleEditor({
  roleId, count, schedule, interview, onSaved,
}: {
  roleId: string;
  count: number;
  schedule?: RoleSchedule;
  interview?: RoleInterview;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Screening appointment
  const [schedAt, setSchedAt] = useState(toLocalInput(schedule?.scheduled_at ?? null));
  const [location, setLocation] = useState(schedule?.location || "");
  const [bring, setBring] = useState(schedule?.bring_items || "");
  const [schedNotes, setSchedNotes] = useState(schedule?.instructions || "");
  // Interview
  const [ivAt, setIvAt] = useState(toLocalInput(interview?.interview_at ?? null));
  const [venue, setVenue] = useState(interview?.venue || "");
  const [ivNotes, setIvNotes] = useState(interview?.notes || "");
  const [busy, setBusy] = useState<null | "schedule" | "interview">(null);

  // Keep local fields in sync when the loaded values change after a save.
  useEffect(() => {
    setSchedAt(toLocalInput(schedule?.scheduled_at ?? null));
    setLocation(schedule?.location || "");
    setBring(schedule?.bring_items || "");
    setSchedNotes(schedule?.instructions || "");
  }, [schedule?.scheduled_at, schedule?.location, schedule?.bring_items, schedule?.instructions]);
  useEffect(() => {
    setIvAt(toLocalInput(interview?.interview_at ?? null));
    setVenue(interview?.venue || "");
    setIvNotes(interview?.notes || "");
  }, [interview?.interview_at, interview?.venue, interview?.notes]);

  const post = async (kind: "schedule" | "interview", body: Record<string, unknown>, label: string) => {
    setBusy(kind);
    try {
      const res = await fetch("/api/admin/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) { appToast({ message: `${label} saved for all ${count}`, kind: "success" }); onSaved(); }
      else appToast({ message: data?.error || "Failed", kind: "error" });
    } finally {
      setBusy(null);
    }
  };

  const saveSchedule = () => post("schedule", {
    action: "set_role_schedule", role_id: roleId,
    scheduled_at: schedAt ? new Date(schedAt).toISOString() : null,
    location, bring_items: bring, instructions: schedNotes,
  }, "Screening appointment");

  const saveInterview = () => post("interview", {
    action: "set_role_interview", role_id: roleId,
    interview_at: ivAt ? new Date(ivAt).toISOString() : null,
    venue, notes: ivNotes,
  }, "Interview");

  const hasSched = !!schedule?.scheduled_at;
  const hasIv = !!interview?.interview_at;

  return (
    <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-[#0A4FE8]" />
            <span className="truncate">
              <span className="font-semibold text-gray-800">Screening:</span>{" "}
              {hasSched ? `${fmtDate(schedule!.scheduled_at)}${schedule?.location ? ` · ${schedule.location}` : ""}` : "not set"}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5 flex-shrink-0 text-[#0A4FE8]" />
            <span className="truncate">
              <span className="font-semibold text-gray-800">Interview:</span>{" "}
              {hasIv ? `${fmtDate(interview!.interview_at)}${interview?.venue ? ` · ${interview.venue}` : ""}` : "not set"}
            </span>
          </span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[#0A4FE8]/30 bg-white px-3 py-1.5 text-xs font-bold text-[#0A4FE8] hover:bg-blue-50"
        >
          <CalendarClock className="h-3.5 w-3.5" /> {open ? "Close" : "Set schedule for all"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-5 border-t border-blue-100 pt-3">
          <p className="text-[11px] text-gray-500">
            Applies to all {count} candidate{count === 1 ? "" : "s"} in this role - they each see it on their portal. Scores stay individual.
          </p>

          {/* Screening appointment */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900"><CalendarClock className="h-4 w-4 text-[#0A4FE8]" /> Screening appointment</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date & time"><input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} className={inputCls} /></Field>
              <Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. CDS Space HQ, Uyo" className={inputCls} /></Field>
            </div>
            <Field label="What to bring"><textarea value={bring} onChange={(e) => setBring(e.target.value)} rows={2} placeholder="e.g. Laptop, charger, valid ID" className={inputCls} /></Field>
            <Field label="Notes / instructions"><textarea value={schedNotes} onChange={(e) => setSchedNotes(e.target.value)} rows={2} placeholder="Anything else they should know" className={inputCls} /></Field>
            <button onClick={saveSchedule} disabled={busy === "schedule"} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
              {busy === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save appointment for all
            </button>
          </div>

          {/* Interview */}
          <div className="space-y-3 border-t border-blue-100 pt-4">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900"><Mic className="h-4 w-4 text-[#0A4FE8]" /> Interview</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date & time"><input type="datetime-local" value={ivAt} onChange={(e) => setIvAt(e.target.value)} className={inputCls} /></Field>
              <Field label="Venue"><input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. CDS Space HQ, Uyo" className={inputCls} /></Field>
            </div>
            <Field label="Notes / instructions"><textarea value={ivNotes} onChange={(e) => setIvNotes(e.target.value)} rows={2} placeholder="Anything candidates should know for the interview" className={inputCls} /></Field>
            <button onClick={saveInterview} disabled={busy === "interview"} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
              {busy === "interview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save interview for all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────── Candidate detail drawer ─────── */
function CandidateDrawer({ candidate, onClose, onSaved }: { candidate: Candidate; onClose: () => void; onSaved: () => void }) {
  const c = candidate;
  const [pScore, setPScore] = useState(c.practical_score != null ? String(c.practical_score) : "");
  const [pFb, setPFb] = useState(c.practical_feedback || "");
  const [iScore, setIScore] = useState(c.interview_score != null ? String(c.interview_score) : "");
  const [iFb, setIFb] = useState(c.interview_feedback || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ answers: AnswerRow[]; events: EventRow[] } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/screening/${c.id}`)
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setDetail({ answers: d.answers, events: d.events }); })
      .catch(() => {});
  }, [c.id]);

  const act = async (action: string, payload: Record<string, unknown>, label: string) => {
    setBusy(action);
    try {
      const res = await fetch("/api/admin/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: c.id, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) { appToast({ message: `${label} saved`, kind: "success" }); onSaved(); }
      else appToast({ message: data?.error || "Failed", kind: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-bold text-gray-900">{c.full_name}</h2>
            <p className="truncate text-xs text-gray-400">{c.email} · {c.role_title}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-6 p-5">
          {c.application_status !== "shortlisted" && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-rose-700">Currently “{c.application_status}” - cannot log in.</p>
                {c.termination_reason && <p className="mt-0.5 text-xs text-rose-600">{c.termination_reason}</p>}
                <button
                  onClick={() => appConfirm({ title: "Re-shortlist candidate?", message: "This re-opens the portal and resets their objective test for another attempt.", confirmLabel: "Re-shortlist" }).then((ok) => ok && act("reshortlist", {}, "Re-shortlist"))}
                  disabled={busy === "reshortlist"}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Re-shortlist & reset
                </button>
              </div>
            </div>
          )}

          {/* Schedule - set once per role from the role header, read-only here */}
          <Section icon={CalendarClock} title="Screening appointment">
            {c.scheduled_at || c.location ? (
              <div className="space-y-1.5 rounded-xl bg-gray-50 px-3 py-3 text-sm">
                <p className="font-semibold text-gray-900">{fmtDate(c.scheduled_at)}</p>
                {c.location && <p className="flex items-center gap-1.5 text-gray-600"><MapPin className="h-3.5 w-3.5" /> {c.location}</p>}
                {c.bring_items && <p className="flex items-start gap-1.5 text-gray-600"><Backpack className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {c.bring_items}</p>}
                {c.instructions && <p className="text-xs text-gray-500">{c.instructions}</p>}
              </div>
            ) : (
              <p className="rounded-xl bg-gray-50 px-3 py-3 text-xs text-gray-500">No appointment set yet.</p>
            )}
            <p className="text-[11px] text-gray-400">Set this for everyone in <strong>{c.role_title || "this role"}</strong> from the “Set schedule for all” button above the role’s candidates.</p>
          </Section>

          {/* Objective result */}
          <Section icon={ClipboardList} title="Objective test">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${statusPill(c.objective_status)}`}>
                {c.objective_status.replace("_", " ")}
              </span>
              {c.objective_status === "submitted" && c.objective_score != null && (
                <span className="text-sm font-bold text-gray-900">{c.objective_score}/{c.objective_total}</span>
              )}
              {c.warning_count > 0 && <span className="text-xs text-amber-600">⚠ {c.warning_count} warning(s)</span>}
            </div>
            {c.termination_reason && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{c.termination_reason}</p>}

            {/* Manual start - open the test on demand, regardless of schedule */}
            {(c.objective_status === "not_started" || c.objective_status === "in_progress") && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Power className={`h-4 w-4 ${c.objective_unlocked ? "text-emerald-500" : "text-gray-400"}`} />
                  {c.objective_unlocked
                    ? "Manually started - the candidate can begin now."
                    : c.scheduled_at
                      ? "Opens automatically at the scheduled time."
                      : "Not scheduled - start manually to let them begin."}
                </div>
                {c.objective_unlocked ? (
                  <button
                    onClick={() => act("lock_objective", {}, "Test locked")}
                    disabled={busy === "lock_objective"}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-white disabled:opacity-60"
                  >
                    {busy === "lock_objective" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />} Close test
                  </button>
                ) : (
                  <button
                    onClick={() => act("start_objective", {}, "Test started")}
                    disabled={busy === "start_objective"}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {busy === "start_objective" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />} Start test now
                  </button>
                )}
              </div>
            )}

            {detail && detail.answers.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {detail.answers.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                    {a.is_correct ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" /> : <Ban className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-400" />}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-700">Q{a.position}. {a.prompt}</p>
                      <p className="text-gray-400">
                        Answered: {a.selected_index != null ? a.options[a.selected_index] : "-"} · Correct: {a.options[a.correct_index]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detail && detail.events.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-gray-500">Activity log ({detail.events.length})</summary>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {detail.events.map((e, i) => (
                    <div key={i} className="flex justify-between gap-2 text-[11px] text-gray-400">
                      <span className="truncate">{e.kind}{e.detail ? ` - ${e.detail}` : ""}</span>
                      <span className="flex-shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </Section>

          {/* Practical rating */}
          <Section icon={Wrench} title="Practical test rating">
            <RatingRow score={pScore} setScore={setPScore} fb={pFb} setFb={setPFb}
              onSave={() => act("rate_practical", { score: pScore === "" ? null : Number(pScore), feedback: pFb }, "Practical rating")}
              busy={busy === "rate_practical"} />
          </Section>

          {/* Interview rating */}
          <Section icon={Mic} title="Interview / oral rating">
            <RatingRow score={iScore} setScore={setIScore} fb={iFb} setFb={setIFb}
              onSave={() => act("rate_interview", { score: iScore === "" ? null : Number(iScore), feedback: iFb }, "Interview rating")}
              busy={busy === "rate_interview"} />
          </Section>

          {/* Decision */}
          <Section icon={CheckCircle2} title="Overall decision">
            <div className="flex flex-wrap gap-2">
              {(["in_progress", "passed", "failed"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => act("decision", { decision: d, update_application: d !== "in_progress" }, "Decision")}
                  disabled={busy === "decision"}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize transition ${
                    c.decision === d
                      ? d === "passed" ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : d === "failed" ? "border-rose-500 bg-rose-50 text-rose-700"
                          : "border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {d.replace("_", " ")}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">Passing also marks the application as <strong>hired</strong>; failing marks it <strong>rejected</strong>.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}

interface AnswerRow { position: number; prompt: string; options: string[]; correct_index: number; selected_index: number | null; is_correct: boolean }
interface EventRow { kind: string; detail: string | null; question_position: number | null; created_at: string }

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0A4FE8]";

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#0A4FE8]" />
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}
function RatingRow({ score, setScore, fb, setFb, onSave, busy }: { score: string; setScore: (v: string) => void; fb: string; setFb: (v: string) => void; onSave: () => void; busy: boolean }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder="0–100" className="w-24 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#0A4FE8]" />
        <span className="text-sm text-gray-400">/ 100</span>
      </div>
      <textarea value={fb} onChange={(e) => setFb(e.target.value)} rows={2} placeholder="Feedback shown to the candidate (optional)" className={inputCls} />
      <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save rating
      </button>
    </>
  );
}

/* ═══════════════ Question Bank ═══════════════ */
interface MemberOption { id: string; full_name: string; role_title: string | null; department: string | null }
interface SetterRow { id: string; team_member_id: string; full_name: string; role_title: string | null; department: string | null }

// open_roles.role_type → display group. Interns are kept separate from
// full-time (and any other) roles, in this order.
const ROLE_TYPE_LABEL: Record<string, string> = {
  "full-time": "Full-time roles",
  intern: "Intern roles",
  "part-time": "Part-time roles",
  contract: "Contract roles",
  freelance: "Freelance roles",
};
const ROLE_TYPE_ORDER = ["full-time", "intern", "part-time", "contract", "freelance"];

function groupRolesByType(roles: Role[]) {
  const map = new Map<string, Role[]>();
  for (const r of roles) {
    const key = r.role_type || "other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  const keys = [...map.keys()].sort((a, b) => {
    const ia = ROLE_TYPE_ORDER.indexOf(a), ib = ROLE_TYPE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return keys.map((k) => ({ key: k, label: ROLE_TYPE_LABEL[k] || "Other roles", roles: map.get(k)! }));
}

function QuestionBankTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [setters, setSetters] = useState<SetterRow[]>([]);
  const [pickMember, setPickMember] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    supabase.from("open_roles").select("id,title,role_type,is_active").order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as Role[] | null) || [];
        setRoles(list);
        setRoleId((cur) => cur || (list[0]?.id ?? ""));
      });
    fetch("/api/admin/members-list", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setMembers(d?.members || [])).catch(() => {});
  }, []);

  const loadSetters = useCallback(async (rid: string) => {
    if (!rid) { setSetters([]); return; }
    const res = await fetch(`/api/admin/screening/setters?role_id=${rid}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setSetters(data?.setters || []);
  }, []);

  useEffect(() => { loadSetters(roleId); }, [roleId, loadSetters]);

  const assign = async () => {
    if (!pickMember || !roleId) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/admin/screening/setters", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", role_id: roleId, team_member_id: pickMember }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) { appToast({ message: "Team member assigned", kind: "success" }); setPickMember(""); loadSetters(roleId); }
      else appToast({ message: data?.error || "Failed", kind: "error" });
    } finally { setAssigning(false); }
  };

  const removeSetter = async (id: string) => {
    const res = await fetch("/api/admin/screening/setters", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", id }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.ok) loadSetters(roleId);
    else appToast({ message: data?.error || "Failed", kind: "error" });
  };

  const grouped = useMemo(() => groupRolesByType(roles), [roles]);
  const assignedIds = new Set(setters.map((s) => s.team_member_id));
  const availableMembers = members.filter((m) => !assignedIds.has(m.id));

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <label className="text-sm font-medium text-gray-500">Role:</label>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]">
          {roles.length === 0 && <option value="">No roles found</option>}
          {grouped.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {g.roles.map((r) => <option key={r.id} value={r.id}>{r.title}{!r.is_active ? " (draft)" : ""}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Delegate question authoring to a team member */}
      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-1 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[#0A4FE8]" />
          <h3 className="text-sm font-bold text-gray-900">Question setters for this role</h3>
        </div>
        <p className="mb-3 text-xs text-gray-400">Assigned team members can author this role&apos;s objective questions from their Team Portal.</p>

        {setters.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {setters.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-2 rounded-full bg-blue-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-[#0A4FE8]">
                {s.full_name}
                {s.role_title && <span className="font-normal text-[#0A4FE8]/60">· {s.role_title}</span>}
                <button onClick={() => removeSetter(s.id)} className="rounded-full p-0.5 hover:bg-white/70" title="Remove"><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-xs text-gray-400">No one assigned yet - you can still set the questions here yourself.</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={pickMember} onChange={(e) => setPickMember(e.target.value)} className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]">
            <option value="">Select a team member…</option>
            {availableMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}{m.role_title ? ` - ${m.role_title}` : ""}</option>
            ))}
          </select>
          <button onClick={assign} disabled={!pickMember || assigning} className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
            {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Assign
          </button>
        </div>
      </div>

      {roleId && (
        <QuestionBankEditor
          roleId={roleId}
          loadUrl={(rid) => `/api/admin/screening/questions?role_id=${rid}`}
          saveUrl="/api/admin/screening/questions"
        />
      )}
    </div>
  );
}
