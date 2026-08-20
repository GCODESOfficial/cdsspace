"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Brain,
  CalendarDays,
  Clock3,
  FileSearch,
  Filter,
  Layers3,
  Loader2,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface WorkActivityData {
  ok: boolean;
  date: string;
  week: { week_start: string; week_end: string };
  members: any[];
  sessions: any[];
  entries: any[];
  daily_reports: any[];
  snapshots: any[];
  weekly_reports: any[];
  comparisons: any[];
  trailing_7_days?: any[];
  stats: Record<string, number>;
}

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

function time(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

function dateTime(value: string | null | undefined) {
  if (!value) return "No update yet";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
}

function minutes(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(Number(seconds || 0) / 60));
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function reportMinutes(value: number | null | undefined) {
  const total = Math.max(0, Number(value || 0));
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function label(value: string | null | undefined) {
  return String(value || "General work").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function recent(value: string | null | undefined, withinMinutes = 3) {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() <= withinMinutes * 60 * 1000;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function evidenceCount(session: any) {
  return Number(session?.evidence_count ?? session?.metadata?.checkpoint_count ?? session?.screenshot_count ?? 0);
}

export default function AdminWorkActivityPage() {
  const [date, setDate] = useState(today());
  const [department, setDepartment] = useState("");
  const [data, setData] = useState<WorkActivityData | null>(null);
  const [detail, setDetail] = useState<WorkActivityData | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/admin/work-tracking?date=${encodeURIComponent(date)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not load work activity.");
      setData(json);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load work activity.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const departments = useMemo(() => Array.from(new Set(
    (data?.members || []).map((member) => member.department).filter(Boolean) as string[],
  )).sort(), [data?.members]);

  const reportByMember = useMemo(() => new Map((data?.daily_reports || []).map((row) => [row.team_member_id, row])), [data?.daily_reports]);
  const entryByMember = useMemo(() => new Map((data?.entries || []).map((row) => [row.team_member_id, row])), [data?.entries]);
  const sessionByMember = useMemo(() => {
    const map = new Map<string, any>();
    for (const session of data?.sessions || []) {
      if (!map.has(session.team_member_id)) map.set(session.team_member_id, session);
    }
    return map;
  }, [data?.sessions]);

  const visibleMembers = useMemo(() => {
    const members = (data?.members || []).filter((member) => !department || member.department === department);
    return members.sort((a, b) => {
      const aSession = sessionByMember.get(a.id);
      const bSession = sessionByMember.get(b.id);
      const aLive = aSession?.status === "active" && recent(aSession?.metadata?.last_heartbeat_at);
      const bLive = bSession?.status === "active" && recent(bSession?.metadata?.last_heartbeat_at);
      if (aLive !== bLive) return aLive ? -1 : 1;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [data?.members, department, sessionByMember]);

  const liveCount = visibleMembers.filter((member) => {
    const session = sessionByMember.get(member.id);
    return session?.status === "active" && recent(session.metadata?.last_heartbeat_at);
  }).length;
  const activeSeconds = visibleMembers.reduce((sum, member) => sum + Number(sessionByMember.get(member.id)?.active_seconds || 0), 0);
  const checkpointCount = visibleMembers.reduce((sum, member) => sum + evidenceCount(sessionByMember.get(member.id)), 0);

  async function openMember(memberId: string) {
    setSelectedMemberId(memberId);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ date, member_id: memberId });
      const res = await fetch(`/api/admin/work-tracking?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not load member activity.");
      setDetail(json);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load member activity.");
      setSelectedMemberId("");
    } finally {
      setDetailLoading(false);
    }
  }

  async function runAction(action: string, memberId = selectedMemberId) {
    if (!memberId && action !== "generate_all_daily_reports") return;
    setWorking(action);
    try {
      const res = await fetch("/api/admin/work-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action,
          member_id: memberId || undefined,
          member_ids: action === "generate_all_daily_reports" ? visibleMembers.map((member) => member.id) : undefined,
          date,
          week_start: data?.week.week_start,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Action failed.");
      if (action === "generate_all_daily_reports") {
        toast.success(`Updated ${json.generated} work summaries${json.failed ? `; ${json.failed} could not be updated` : ""}.`);
      } else {
        toast.success("Work report updated.");
      }
      await load(true);
      if (memberId) await openMember(memberId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <div className="grid min-h-[80vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#F4F7FD] px-4 py-6 md:px-7">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0A4FE8]">HRM · Activity</p>
            <h1 className="mt-1 text-[30px] font-bold tracking-tight text-[#0D1B39]">Work activity</h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-500">
              Attendance-linked focus, real Taskboard context and member-declared evidence. Quiet reading or study is never automatically labelled idle.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Date</span>
              <input type="date" value={date} onChange={(event) => {
                setDate(event.target.value);
                setSelectedMemberId("");
                setDetail(null);
              }} className="h-10 rounded-xl border border-white bg-white px-3 text-[12px] text-[#0D1B39] shadow-sm outline-none" />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Department</span>
              <select value={department} onChange={(event) => setDepartment(event.target.value)}
                className="h-10 rounded-xl border border-white bg-white px-3 text-[12px] text-[#0D1B39] shadow-sm outline-none">
                <option value="">All departments</option>
                {departments.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void load(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button type="button" onClick={() => void runAction("generate_all_daily_reports")} disabled={working === "generate_all_daily_reports"}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-bold text-white shadow-md shadow-blue-200 disabled:opacity-60">
              {working === "generate_all_daily_reports" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Update summaries
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={Users} label="People in view" value={String(visibleMembers.length)} />
          <Metric icon={Activity} label="Live focus" value={String(liveCount)} tone="emerald" />
          <Metric icon={Clock3} label="Active context" value={minutes(activeSeconds)} tone="blue" />
          <Metric icon={Layers3} label="Evidence updates" value={String(checkpointCount)} tone="violet" />
        </div>

        <section className="overflow-hidden rounded-[22px] border border-white/80 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[16px] font-bold text-[#0D1B39]">Team focus</h2>
              <p className="mt-0.5 text-[11.5px] text-slate-400">Open a person to review their exact task and activity timeline.</p>
            </div>
            {department && (
              <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-blue-50 px-3 py-1.5 text-[10.5px] font-bold text-[#0A4FE8]">
                <Filter className="h-3 w-3" /> {department}
              </span>
            )}
          </div>

          {visibleMembers.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">No team members in this view.</p>
          ) : (
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">
              {visibleMembers.map((member) => {
                const session = sessionByMember.get(member.id);
                const entry = entryByMember.get(member.id);
                const report = reportByMember.get(member.id);
                const isLive = session?.status === "active" && recent(session.metadata?.last_heartbeat_at);
                const checkedIn = !!entry?.clock_in_at && !entry?.clock_out_at;
                const focus = session?.metadata?.focus_detail || session?.metadata?.task_title || null;
                return (
                  <button key={member.id} type="button" onClick={() => void openMember(member.id)}
                    className="group bg-white p-4 text-left transition hover:bg-blue-50/40">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{initials(member.full_name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-bold text-[#0D1B39]">{member.full_name}</span>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${isLive ? "bg-emerald-500" : checkedIn ? "bg-amber-400" : "bg-slate-300"}`} />
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-slate-400">
                          {member.role_title || "Team member"}{member.department ? ` · ${member.department}` : ""}
                        </span>
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[9.5px] font-bold uppercase ${
                        isLive ? "bg-emerald-50 text-emerald-700" : checkedIn ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {isLive ? "Live" : checkedIn ? "No recent update" : "Not checked in"}
                      </span>
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <p className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">{label(session?.metadata?.focus_category)}</p>
                      <p className={`mt-1 line-clamp-2 min-h-9 text-[12px] leading-4.5 ${focus ? "font-semibold text-slate-650" : "text-slate-400"}`}>
                        {focus || "No focus context submitted yet."}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[9.5px] text-slate-400">
                        <span>{session?.metadata?.task_title ? "Taskboard linked" : "General activity"}</span>
                        <span>{session?.metadata?.last_heartbeat_at ? time(session.metadata.last_heartbeat_at) : "Not available"}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-[10.5px] text-slate-500">
                      <span>{minutes(session?.active_seconds)} active</span>
                      <span>·</span>
                      <span>{evidenceCount(session)} updates</span>
                      {report && <><span>·</span><span>{Math.round(Number(report.overall_score || 0))}% summary</span></>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedMemberId && (
        <MemberActivityDrawer
          data={detail}
          memberId={selectedMemberId}
          loading={detailLoading}
          working={working}
          onClose={() => {
            setSelectedMemberId("");
            setDetail(null);
          }}
          onAction={(action) => void runAction(action)}
        />
      )}
    </div>
  );
}

function Metric({ icon: Icon, label: metricLabel, value, tone = "slate" }: {
  icon: typeof Users;
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "blue" | "violet";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-[#0A4FE8]",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">{metricLabel}</p>
      <p className="mt-0.5 text-[22px] font-bold text-[#0D1B39]">{value}</p>
    </div>
  );
}

function MemberActivityDrawer({ data, memberId, loading, working, onClose, onAction }: {
  data: WorkActivityData | null;
  memberId: string;
  loading: boolean;
  working: string | null;
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  const member = data?.members.find((row) => row.id === memberId);
  const session = data?.sessions.find((row) => row.team_member_id === memberId);
  const entry = data?.entries.find((row) => row.team_member_id === memberId);
  const report = data?.daily_reports.find((row) => row.team_member_id === memberId);
  const weekly = data?.weekly_reports.find((row) => row.team_member_id === memberId);
  const comparison = data?.comparisons.find((row) => row.team_member_id === memberId);
  const snapshots = (data?.snapshots || []).filter((row) => row.team_member_id === memberId);
  const categoryRows = Object.entries(report?.time_by_category || {}).sort((a, b) => Number(b[1]) - Number(a[1]));

  return (
    <div className="fixed inset-0 z-[90] bg-[#040B37]/45 backdrop-blur-sm" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <aside className="ml-auto flex h-full w-full max-w-[760px] flex-col bg-[#F4F7FD] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0A4FE8]">Member activity</p>
            <h2 className="mt-1 truncate text-[21px] font-bold text-[#0D1B39]">{member?.full_name || "Loading…"}</h2>
            <p className="mt-0.5 text-[11.5px] text-slate-400">{member?.role_title || "Team member"}{member?.department ? ` · ${member.department}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Close member activity">
            <X className="h-5 w-5" />
          </button>
        </header>

        {loading ? (
          <div className="grid flex-1 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SmallMetric label="Attendance" value={entry?.attendance_status ? label(entry.attendance_status) : "No entry"} />
              <SmallMetric label="Check in" value={time(entry?.clock_in_at)} />
              <SmallMetric label="Active context" value={minutes(session?.active_seconds)} />
              <SmallMetric label="Evidence updates" value={String(evidenceCount(session))} />
            </div>

            <section className="rounded-2xl bg-[#040B37] p-5 text-white">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/20 text-blue-200">
                  {session?.metadata?.focus_category === "learning" ? <BookOpen className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">Current focus · {label(session?.metadata?.focus_category)}</p>
                  <p className="mt-1 text-[15px] font-semibold leading-6">{session?.metadata?.focus_detail || session?.metadata?.task_title || "No focus submitted."}</p>
                  {session?.metadata?.task_title && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] text-white/70">
                      <Layers3 className="h-3 w-3" /> {session.metadata.task_title}
                    </p>
                  )}
                  <p className="mt-3 text-[10px] text-white/35">Last heartbeat: {dateTime(session?.metadata?.last_heartbeat_at)}</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-bold text-[#0D1B39]">Activity timeline</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">Task context submitted throughout the work session.</p>
                </div>
                <button type="button" onClick={() => onAction("generate_daily_report")} disabled={working === "generate_daily_report"}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-bold text-[#0A4FE8] disabled:opacity-50">
                  {working === "generate_daily_report" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />} Update daily summary
                </button>
              </div>
              {snapshots.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-slate-400">No focus evidence recorded on this date.</p>
              ) : (
                <div className="mt-5 space-y-0">
                  {snapshots.map((snapshot, index) => (
                    <div key={snapshot.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${index === 0 ? "bg-[#0A4FE8]" : "bg-slate-300"}`} />
                        {index < snapshots.length - 1 && <span className="h-full min-h-16 w-px bg-slate-200" />}
                      </div>
                      <div className="min-w-0 flex-1 pb-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-[#0D1B39]">{time(snapshot.captured_at)}</span>
                          {(snapshot.ai_categories || []).map((category: string) => (
                            <span key={category} className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold uppercase text-[#0A4FE8]">{label(category)}</span>
                          ))}
                          {snapshot.metadata?.evidence_type && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">Member confirmed</span>
                          )}
                        </div>
                        <p className="mt-1 text-[12.5px] font-semibold leading-5 text-slate-650">{snapshot.ai_summary || "Work focus update"}</p>
                        <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-slate-400">
                          {snapshot.project_hint && <span>Task: {snapshot.project_hint}</span>}
                          {snapshot.page_url && <span>Portal: {snapshot.page_url}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-bold text-[#0D1B39]">Daily summary</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">Built from explicit task context and attendance.</p>
                </div>
                {report && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{Math.round(Number(report.overall_score || 0))}% overall</span>}
              </div>
              {report ? (
                <>
                  <p className="mt-4 text-[12.5px] leading-6 text-slate-600">{report.summary}</p>
                  {categoryRows.length > 0 && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {categoryRows.map(([category, value]) => (
                        <div key={category} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                          <span className="text-[11px] font-semibold text-slate-600">{label(category)}</span>
                          <span className="text-[11px] font-bold text-[#0D1B39]">{reportMinutes(Number(value))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-4 text-[12px] text-slate-400">Generate the daily summary after activity has been recorded.</p>
              )}
            </section>

            <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-bold text-[#0D1B39]">Reports</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">Roll up the week and compare with the member’s report.</p>
                </div>
                <div className="flex gap-2">
                  <ActionButton icon={CalendarDays} label="Weekly" busy={working === "generate_weekly_report"} onClick={() => onAction("generate_weekly_report")} />
                  <ActionButton icon={FileSearch} label="Compare" busy={working === "compare_weekly_report"} onClick={() => onAction("compare_weekly_report")} />
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Weekly rollup</p>
                  <p className="mt-2 text-[11.5px] leading-5 text-slate-600">{weekly?.summary || "Not generated yet."}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Report comparison</p>
                  <p className="mt-2 text-[11.5px] leading-5 text-slate-600">{comparison?.ai_summary || "Not compared yet."}</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
              <h3 className="text-[15px] font-bold text-[#0D1B39]">Past seven days</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[580px] text-left text-[11px]">
                  <thead className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Attendance</th>
                      <th className="px-2 py-2">Active context</th>
                      <th className="px-2 py-2">Evidence</th>
                      <th className="px-2 py-2">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data?.trailing_7_days || []).map((row) => (
                      <tr key={row.date}>
                        <td className="px-2 py-2.5 font-bold text-[#0D1B39]">{row.date}</td>
                        <td className="px-2 py-2.5 text-slate-500">{label(row.entry?.attendance_status || "No entry")}</td>
                        <td className="px-2 py-2.5 text-slate-500">{minutes(row.session?.active_seconds)}</td>
                        <td className="px-2 py-2.5 text-slate-500">{evidenceCount(row.session)} updates</td>
                        <td className="px-2 py-2.5 text-slate-500">{row.report ? `${Math.round(Number(row.report.overall_score || 0))}%` : "Not available"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function SmallMetric({ label: metricLabel, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{metricLabel}</p>
      <p className="mt-1 truncate text-[13px] font-bold text-[#0D1B39]">{value}</p>
    </div>
  );
}

function ActionButton({ icon: Icon, label: actionLabel, busy, onClick }: {
  icon: typeof CalendarDays;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-[10.5px] font-bold text-[#0A4FE8] disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />} {actionLabel}
    </button>
  );
}
