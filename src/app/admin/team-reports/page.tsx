"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Team Reports (super-admin only)
 *
 * Side-by-side view of what each member SAYS they did (manual daily report +
 * weekly self-report) against what the tracking system OBSERVED (automated
 * daily report from screenshots/activity), with the weekly comparison verdict.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Users, FileText, Bot, GitCompareArrows, CircleDot,
  ChevronDown, ChevronUp, Sparkles, CalendarRange, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";

type Row = {
  member: { id: string; full_name: string; role_title: string | null; department: string | null };
  attendance: any;
  tracking_session: any;
  manual_daily: any;
  auto_daily: any;
  self_report: any;
  weekly_report: any;
  comparison: any;
};

function fmtMins(mins?: number | null) {
  const m = Number(mins || 0);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtSecs(secs?: number | null) {
  return fmtMins(Math.round(Number(secs || 0) / 60));
}
function score(v?: number | null) {
  return v == null ? "—" : `${Math.round(Number(v))}%`;
}

// A member has "submitted their report" if they filed a manual daily report
// and/or a weekly self-report.
function hasSubmittedReport(row: Row) {
  return !!row.manual_daily || !!row.self_report;
}

// A member has "active tracking data" if a session captured activity (live or
// with screenshots) or the system generated a tracking report for the day.
function hasTrackingData(row: Row) {
  const sess = row.tracking_session;
  const tracked = !!sess && (sess.status === "active" || Number(sess.screenshot_count || 0) > 0);
  return tracked || !!row.auto_daily;
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF1FF]">
        <Icon className="h-4.5 w-4.5 h-[18px] w-[18px] text-[#0A4FE8]" />
      </div>
      <p className="mt-4 text-3xl font-bold text-[#0D1B39]">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}

export default function TeamReportsPage() {
  const [date, setDate] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState<string>("");

  const load = useCallback(async (d?: string) => {
    setLoading(true);
    try {
      const qs = d || date ? `?date=${encodeURIComponent(d || date)}` : "";
      const r = await fetch(`/api/admin/team-reports${qs}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to load");
      setData(j);
      setDate(j.date);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const runAction = useCallback(async (action: string, memberId: string, label: string) => {
    setActing(`${action}:${memberId}`);
    try {
      const r = await fetch("/api/admin/work-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, member_id: memberId, date }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `${label} failed`);
      toast.success(`${label} done`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setActing("");
    }
  }, [date, load]);

  const rows: Row[] = data?.rows ?? [];
  // Only show members who BOTH submitted a report AND have active tracking data.
  const visibleRows = rows.filter((row) => hasSubmittedReport(row) && hasTrackingData(row));

  return (
    <div className="min-h-screen bg-[#F0F5FF] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1560px] space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0A4FE8]">HRM Intelligence</p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight text-[#0D1B39]">Team Reports</h1>
            <p className="mt-2 text-sm text-gray-500">
              What each member reported vs what the tracking system observed. Super admin only.
            </p>
            {data?.week && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                <CalendarRange className="h-3.5 w-3.5" /> Week {data.week.week_start} → {data.week.week_end}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 rounded-xl border border-white bg-white px-3 text-sm outline-none"
              />
            </label>
            <button onClick={() => load()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white">
              <RefreshCw className="h-4 w-4" /> Apply
            </button>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-[420px] place-items-center rounded-2xl bg-white">
            <Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" />
          </div>
        ) : !data ? null : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <Stat icon={Users} label="Team" value={String(data.summary.total)} />
              <Stat icon={CircleDot} label="Tracking Now" value={String(data.summary.tracking_now)} />
              <Stat icon={FileText} label="Manual Reports (Day)" value={`${data.summary.manual_submitted}/${data.summary.total}`} />
              <Stat icon={Bot} label="System Reports (Day)" value={String(data.summary.auto_generated)} />
              <Stat icon={FileText} label="Weekly Self-Reports" value={String(data.summary.self_reports)} />
              <Stat icon={GitCompareArrows} label="Comparisons Run" value={String(data.summary.comparisons)} />
            </div>

            <div className="overflow-hidden rounded-2xl bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
                <div>
                  <p className="text-sm font-bold text-[#0D1B39]">Reported &amp; tracked members</p>
                  <p className="text-xs text-gray-400">Showing members who submitted a report and have active tracking data.</p>
                </div>
                <span className="rounded-full bg-[#EAF1FF] px-3 py-1 text-xs font-bold text-[#0A4FE8]">
                  {visibleRows.length} of {rows.length}
                </span>
              </div>
              {visibleRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  <Users className="h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-[#0D1B39]">No members to show for this date</p>
                  <p className="max-w-md text-xs text-gray-400">
                    Only members who both submitted a report and have active tracking data appear here. Pick another date or wait for reports and tracking to come in.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                        <th className="px-5 py-4">Member</th>
                        <th className="px-4 py-4">Attendance</th>
                        <th className="px-4 py-4">Tracking</th>
                        <th className="px-4 py-4">Manual Report</th>
                        <th className="px-4 py-4">System Report</th>
                        <th className="px-4 py-4">Comparison</th>
                        <th className="px-4 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const open = expanded === row.member.id;
                        return (
                          <FragmentRow
                            key={row.member.id}
                            row={row}
                            open={open}
                            onToggle={() => setExpanded(open ? null : row.member.id)}
                            acting={acting}
                            runAction={runAction}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FragmentRow({ row, open, onToggle, acting, runAction }: {
  row: Row;
  open: boolean;
  onToggle: () => void;
  acting: string;
  runAction: (action: string, memberId: string, label: string) => void;
}) {
  const m = row.member;
  const att = row.attendance;
  const sess = row.tracking_session;
  const comparison = row.comparison;

  return (
    <>
      <tr className="cursor-pointer border-b border-gray-50 transition hover:bg-[#F7FAFF]" onClick={onToggle}>
        <td className="px-5 py-4">
          <p className="font-semibold text-[#0D1B39]">{m.full_name}</p>
          <p className="text-xs text-gray-400">{m.role_title || "—"}{m.department ? ` · ${m.department}` : ""}</p>
        </td>
        <td className="px-4 py-4">
          {att?.clock_in_at ? (
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${att.attendance_status === "late" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
              {String(att.attendance_status || "in").replace(/_/g, " ")}
            </span>
          ) : (
            <span className="text-xs text-gray-300">Not in</span>
          )}
        </td>
        <td className="px-4 py-4">
          {sess ? (
            <div className="text-xs text-gray-500">
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${sess.status === "active" ? "bg-emerald-500" : "bg-gray-300"}`} />
              {sess.screenshot_count || 0} captures · {fmtSecs(sess.active_seconds)} active
            </div>
          ) : (
            <span className="text-xs text-gray-300">No session</span>
          )}
        </td>
        <td className="px-4 py-4">
          {row.manual_daily ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Submitted</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-gray-300"><XCircle className="h-3.5 w-3.5" /> None</span>
          )}
        </td>
        <td className="px-4 py-4">
          {row.auto_daily ? (
            <span className="text-xs font-semibold text-[#0D1B39]">P {score(row.auto_daily.productivity_score)} · F {score(row.auto_daily.focus_score)}</span>
          ) : (
            <span className="text-xs text-gray-300">Not generated</span>
          )}
        </td>
        <td className="px-4 py-4">
          {comparison ? (
            <span className="rounded-full bg-[#EAF1FF] px-2.5 py-1 text-[11px] font-bold text-[#0A4FE8]">
              {Math.round(Number(comparison.confidence_score || 0))}% aligned
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
        <td className="px-4 py-4 text-right">
          <span className="inline-flex items-center text-gray-300">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-50 bg-[#FAFCFF]">
          <td colSpan={7} className="px-5 py-5">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Manual */}
              <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><FileText className="h-3.5 w-3.5" /> Member&apos;s own report</p>
                {row.manual_daily ? (
                  <div className="mt-2 space-y-2 text-[13px] text-gray-600">
                    {row.manual_daily.completed && <p><b className="text-[#0D1B39]">Done:</b> {row.manual_daily.completed}</p>}
                    {row.manual_daily.pending && <p><b className="text-[#0D1B39]">Pending:</b> {row.manual_daily.pending}</p>}
                    {row.manual_daily.blockers && <p><b className="text-red-600">Blockers:</b> {row.manual_daily.blockers}</p>}
                  </div>
                ) : <p className="mt-2 text-[13px] text-gray-300">No daily report submitted for this date.</p>}
                {row.self_report && (
                  <div className="mt-3 border-t border-gray-100 pt-3 text-[13px] text-gray-600">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Weekly self-report</p>
                    {row.self_report.tasks_completed && <p className="mt-1"><b className="text-[#0D1B39]">Completed:</b> {row.self_report.tasks_completed}</p>}
                    {row.self_report.wins && <p><b className="text-emerald-600">Wins:</b> {row.self_report.wins}</p>}
                    {row.self_report.challenges && <p><b className="text-amber-600">Challenges:</b> {row.self_report.challenges}</p>}
                  </div>
                )}
              </div>

              {/* System */}
              <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Bot className="h-3.5 w-3.5" /> System tracking report</p>
                {row.auto_daily ? (
                  <div className="mt-2 space-y-2 text-[13px] text-gray-600">
                    <p><b className="text-[#0D1B39]">Productivity:</b> {score(row.auto_daily.productivity_score)} · <b className="text-[#0D1B39]">Focus:</b> {score(row.auto_daily.focus_score)}</p>
                    <p><b className="text-[#0D1B39]">Active:</b> {fmtMins(row.auto_daily.active_minutes)} · <b className="text-[#0D1B39]">Idle:</b> {fmtMins(row.auto_daily.idle_minutes)}</p>
                    {row.auto_daily.summary && <p className="rounded-lg bg-[#F7FAFF] p-2.5 leading-relaxed">{row.auto_daily.summary}</p>}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-gray-300">No system report generated yet for this date.</p>
                )}
                {att && (
                  <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] text-gray-400">
                    Worked {fmtMins(att.total_work_minutes)} on the timebook this day.
                  </p>
                )}
              </div>

              {/* Comparison */}
              <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><GitCompareArrows className="h-3.5 w-3.5" /> Manual vs tracked (week)</p>
                {comparison ? (
                  <div className="mt-2 space-y-2 text-[13px] text-gray-600">
                    {comparison.ai_summary && <p className="leading-relaxed">{comparison.ai_summary}</p>}
                    {Array.isArray(comparison.matches) && comparison.matches.length > 0 && (
                      <p><b className="text-emerald-600">Matches:</b> {comparison.matches.join(", ")}</p>
                    )}
                    {Array.isArray(comparison.omissions) && comparison.omissions.length > 0 && (
                      <p><b className="text-amber-600">Claimed but not observed:</b> {comparison.omissions.join(", ")}</p>
                    )}
                    {Array.isArray(comparison.additional_detected_work) && comparison.additional_detected_work.length > 0 && (
                      <p><b className="text-[#0A4FE8]">Observed but not claimed:</b> {comparison.additional_detected_work.join(", ")}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-gray-300">
                    Run the comparison once both the weekly rollup and the member&apos;s weekly self-report exist.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                busy={acting === `generate_daily_report:${m.id}`}
                onClick={() => runAction("generate_daily_report", m.id, "Daily report")}
                icon={Sparkles}
                label="Generate day report"
              />
              <ActionButton
                busy={acting === `generate_weekly_report:${m.id}`}
                onClick={() => runAction("generate_weekly_report", m.id, "Weekly rollup")}
                icon={Bot}
                label="Weekly rollup"
              />
              <ActionButton
                busy={acting === `compare_weekly_report:${m.id}`}
                onClick={() => runAction("compare_weekly_report", m.id, "Comparison")}
                icon={GitCompareArrows}
                label="Compare manual vs tracked"
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ActionButton({ busy, onClick, icon: Icon, label }: { busy: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3.5 text-[12.5px] font-semibold text-white transition hover:bg-[#0940BE] disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />} {label}
    </button>
  );
}
