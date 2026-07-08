"use client";

/**
 * Weekly Report — the member-facing side of work tracking.
 *
 * Members submit their own weekly report here (what they completed, wins,
 * challenges, next-week goals). Management compares this against the
 * automated tracking report in Admin → Team Reports.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, CheckCircle2, CalendarRange, FileText } from "lucide-react";
import { toast } from "sonner";

type SelfReport = {
  tasks_completed: string | null;
  challenges: string | null;
  wins: string | null;
  goals_next_week: string | null;
  submitted_at: string | null;
};

export default function TeamWeeklyReportPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [week, setWeek] = useState<{ week_start: string; week_end: string } | null>(null);
  const [existing, setExisting] = useState<SelfReport | null>(null);
  const [form, setForm] = useState({ tasks_completed: "", challenges: "", wins: "", goals_next_week: "" });

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/team/work-tracking");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to load");
      setWeek(j.week ?? null);
      const sr = j.self_report as SelfReport | null;
      setExisting(sr);
      if (sr) {
        setForm({
          tasks_completed: sr.tasks_completed ?? "",
          challenges: sr.challenges ?? "",
          wins: sr.wins ?? "",
          goals_next_week: sr.goals_next_week ?? "",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async () => {
    if (!form.tasks_completed.trim()) {
      toast.error("Tell us what you completed this week.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/team/work-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit_self_report", ...form }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Could not submit");
      setExisting(j.self_report);
      toast.success("Weekly report submitted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSaving(false);
    }
  }, [form]);

  if (loading) return <div className="flex justify-center py-24 text-brand-body/40"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const fields: { key: keyof typeof form; label: string; placeholder: string; required?: boolean }[] = [
    { key: "tasks_completed", label: "What did you complete this week?", placeholder: "Deliverables, tasks, projects you finished or moved forward…", required: true },
    { key: "wins", label: "Wins", placeholder: "Anything that went especially well…" },
    { key: "challenges", label: "Challenges / blockers", placeholder: "What slowed you down or blocked you…" },
    { key: "goals_next_week", label: "Goals for next week", placeholder: "What you plan to get done next week…" },
  ];

  return (
    <div className="max-w-[760px] space-y-5">
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-blue-600 to-blue-800 p-5 text-white sm:p-7">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Weekly Report</p>
          <h1 className="mt-1 flex items-center gap-2 text-[24px] font-bold tracking-tight sm:text-[28px]">
            <FileText className="h-6 w-6" /> Your week, in your words
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-white/85">
            {week && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4" /> {week.week_start} → {week.week_end}
              </span>
            )}
            {existing?.submitted_at && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-400/25 px-3 py-1 text-[12px] font-semibold text-green-50">
                <CheckCircle2 className="h-3.5 w-3.5" /> Submitted {new Date(existing.submitted_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}
              </span>
            )}
          </div>
          <p className="mt-2 text-[12.5px] text-white/70">
            Management compares this with your tracked work session, so be specific — it&apos;s how your effort gets seen. You can update it any time before the week ends.
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-brand-stroke/30 sm:p-7">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-[12px] font-semibold uppercase tracking-wide text-brand-body/60">
              {f.label}{f.required && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              value={form[f.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              rows={f.key === "tasks_completed" ? 5 : 3}
              className="mt-1.5 w-full rounded-2xl border border-brand-stroke/40 bg-brand-bg/40 px-4 py-3 text-[13.5px] leading-relaxed placeholder:text-brand-body/35 focus:border-brand-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-blue/15"
            />
          </div>
        ))}
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-[14px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {existing ? "Update report" : "Submit report"}
        </button>
      </div>
    </div>
  );
}
