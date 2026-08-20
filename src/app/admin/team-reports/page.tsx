"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Team Reports (super-admin only)
 *
 * Side-by-side view of what each member SAYS they did (manual daily report +
 * weekly self-report) against the attendance-linked task and focus evidence,
 * with the weekly comparison verdict.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Users, FileText, Bot, GitCompareArrows, CircleDot,
  ChevronDown, ChevronUp, CalendarRange, CheckCircle2, XCircle, Paperclip, ExternalLink,
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
  return v == null ? "-" : `${Math.round(Number(v))}%`;
}
function evidenceCount(session: any) {
  return Number(session?.metadata?.checkpoint_count ?? session?.screenshot_count ?? 0);
}

// A member has "submitted their report" if they filed a weekly self-report.
// (Daily report surfaces were retired; weekly is the only member-facing report.)
function hasSubmittedReport(row: Row) {
  return !!row.self_report;
}

// A member has work evidence if a focus session recorded activity or the
// system generated an attendance-linked summary for the day.
function hasTrackingData(row: Row) {
  const sess = row.tracking_session;
  const tracked = !!sess && (sess.status === "active" || evidenceCount(sess) > 0 || Number(sess.active_seconds || 0) > 0);
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
  // Show members who submitted a daily or weekly report, OR who have tracking
  // data - so reports are always visible even before any tracking is captured.
  const visibleRows = rows.filter((row) => hasSubmittedReport(row) || hasTrackingData(row));

  return (
    <div className="min-h-screen bg-[#F0F5FF] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1560px] space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0A4FE8]">HRM Intelligence</p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight text-[#0D1B39]">Team Reports</h1>
            <p className="mt-2 text-sm text-gray-500">
              What each member reported compared with attendance-linked task and focus evidence.
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
              <Stat icon={CircleDot} label="Active Focus" value={String(data.summary.tracking_now)} />
              <Stat icon={FileText} label="Manual Reports (Day)" value={`${data.summary.manual_submitted}/${data.summary.total}`} />
              <Stat icon={Bot} label="System Reports (Day)" value={String(data.summary.auto_generated)} />
              <Stat icon={FileText} label="Weekly Self-Reports" value={String(data.summary.self_reports)} />
              <Stat icon={GitCompareArrows} label="Comparisons Run" value={String(data.summary.comparisons)} />
            </div>

            <div className="overflow-hidden rounded-2xl bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
                <div>
                  <p className="text-sm font-bold text-[#0D1B39]">Reports &amp; activity evidence</p>
                  <p className="text-xs text-gray-400">Members who submitted a report or recorded work focus. Click a row for the full daily and weekly comparison.</p>
                </div>
                <span className="rounded-full bg-[#EAF1FF] px-3 py-1 text-xs font-bold text-[#0A4FE8]">
                  {visibleRows.length} of {rows.length}
                </span>
              </div>
              {visibleRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  <Users className="h-8 w-8 text-gray-300" />
                  <p className="text-sm font-semibold text-[#0D1B39]">No reports for this date yet</p>
                  <p className="max-w-md text-xs text-gray-400">
                    Members appear here once they submit a report or record work focus. Pick another date to review earlier reports.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                        <th className="px-5 py-4">Member</th>
                        <th className="px-4 py-4">Attendance</th>
                        <th className="px-4 py-4">Activity</th>
                        <th className="px-4 py-4">Weekly report</th>
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
          <p className="text-xs text-gray-400">{m.role_title || "-"}{m.department ? ` · ${m.department}` : ""}</p>
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
              {evidenceCount(sess)} updates · {fmtSecs(sess.active_seconds)} active
            </div>
          ) : (
            <span className="text-xs text-gray-300">No session</span>
          )}
        </td>
        <td className="px-4 py-4">
          <div className="flex flex-wrap gap-1.5">
            <span
              title={row.self_report ? "Weekly report submitted" : "No weekly report"}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${row.self_report ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"}`}
            >
              {row.self_report ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} Weekly
            </span>
          </div>
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
            <span className="text-xs text-gray-300">-</span>
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
                {row.self_report ? (
                  <div className="mt-2 space-y-2 text-[13px] text-gray-600">
                    {row.self_report.tasks_completed && <p><b className="text-[#0D1B39]">Completed:</b> {row.self_report.tasks_completed}</p>}
                    {row.self_report.wins && <p><b className="text-emerald-600">Wins:</b> {row.self_report.wins}</p>}
                    {row.self_report.challenges && <p><b className="text-amber-600">Challenges:</b> {row.self_report.challenges}</p>}
                    {Array.isArray(row.self_report.attachments) && row.self_report.attachments.length > 0 && (
                      <div className="pt-1">
                        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-gray-500"><Paperclip className="h-3.5 w-3.5" /> Supporting documents</p>
                        <div className="flex flex-wrap gap-1.5">
                          {row.self_report.attachments.map((attachment: any) => (
                            <a key={attachment.id} href={`/api/team/work-tracking/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-100">
                              <span className="truncate">{attachment.title}</span><ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : <p className="mt-2 text-[13px] text-gray-300">No weekly report submitted for this period.</p>}
              </div>

              {/* System */}
              <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Bot className="h-3.5 w-3.5" /> System activity summary</p>
                {row.auto_daily ? (
                  <div className="mt-2 space-y-2 text-[13px] text-gray-600">
                    <p><b className="text-[#0D1B39]">Productivity:</b> {score(row.auto_daily.productivity_score)} · <b className="text-[#0D1B39]">Focus:</b> {score(row.auto_daily.focus_score)}</p>
                    <p><b className="text-[#0D1B39]">Recorded focus:</b> {fmtMins(row.auto_daily.active_minutes)}</p>
                    {row.auto_daily.summary && <p className="rounded-lg bg-[#F7FAFF] p-2.5 leading-relaxed">{row.auto_daily.summary}</p>}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-gray-300">No system report generated yet for this date.</p>
                )}
                {att && (
                  <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] text-gray-400">
                    Attendance recorded {fmtMins(att.total_work_minutes)} for this day.
                  </p>
                )}
              </div>

              {/* Comparison */}
              <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><GitCompareArrows className="h-3.5 w-3.5" /> Report vs recorded evidence</p>
                {comparison ? (
                  <div className="mt-2 space-y-2 text-[13px] text-gray-600">
                    {comparison.ai_summary && <p className="leading-relaxed">{comparison.ai_summary}</p>}
                    {Array.isArray(comparison.matches) && comparison.matches.length > 0 && (
                      <p><b className="text-emerald-600">Matches:</b> {comparison.matches.join(", ")}</p>
                    )}
                    {Array.isArray(comparison.omissions) && comparison.omissions.length > 0 && (
                      <p><b className="text-amber-600">Reported without matching evidence:</b> {comparison.omissions.join(", ")}</p>
                    )}
                    {Array.isArray(comparison.additional_detected_work) && comparison.additional_detected_work.length > 0 && (
                      <p><b className="text-[#0A4FE8]">Recorded but not reported:</b> {comparison.additional_detected_work.join(", ")}</p>
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
                icon={Bot}
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
                label="Compare report vs evidence"
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
