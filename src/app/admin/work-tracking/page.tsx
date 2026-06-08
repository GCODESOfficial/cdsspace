"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  CalendarDays,
  Clock,
  Download,
  Eye,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { appAlert } from "@/lib/app-notify";

interface WorkTrackingAdminData {
  date: string;
  week: { week_start: string; week_end: string };
  settings: any | null;
  members: any[];
  sessions: any[];
  entries: any[];
  daily_reports: any[];
  snapshots: any[];
  weekly_reports: any[];
  self_reports: any[];
  comparisons: any[];
  access_logs: any[];
  stats: Record<string, number>;
  screenshot_access: boolean;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function score(value: number | null | undefined) {
  return `${Math.round(Number(value || 0))}%`;
}

function minutesLabel(value: number | null | undefined) {
  const total = Number(value || 0);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function shortTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AdminWorkTrackingPage() {
  const [date, setDate] = useState(today());
  const [memberId, setMemberId] = useState("");
  const [data, setData] = useState<WorkTrackingAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (memberId) params.set("member_id", memberId);
      const res = await fetch(`/api/admin/work-tracking?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        appAlert(json.error || "Could not load work tracking.");
        return;
      }
      setData(json);
      if (!memberId && json.members?.[0]?.id) setMemberId(json.members[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reportByMember = useMemo(() => new Map((data?.daily_reports || []).map((report) => [report.team_member_id, report])), [data?.daily_reports]);
  const entryByMember = useMemo(() => new Map((data?.entries || []).map((entry) => [entry.team_member_id, entry])), [data?.entries]);
  const sessionByMember = useMemo(() => new Map((data?.sessions || []).map((session) => [session.team_member_id, session])), [data?.sessions]);
  const weeklyByMember = useMemo(() => new Map((data?.weekly_reports || []).map((report) => [report.team_member_id, report])), [data?.weekly_reports]);
  const comparisonByMember = useMemo(() => new Map((data?.comparisons || []).map((comparison) => [comparison.team_member_id, comparison])), [data?.comparisons]);
  const selectedMember = data?.members.find((member) => member.id === memberId) || null;
  const selectedReport = reportByMember.get(memberId) as any | undefined;
  const selectedWeekly = weeklyByMember.get(memberId) as any | undefined;
  const selectedComparison = comparisonByMember.get(memberId) as any | undefined;
  const selectedSnapshots = (data?.snapshots || []).filter((snapshot) => snapshot.team_member_id === memberId);

  const chartRows = useMemo(() => (data?.members || []).map((member) => {
    const report = reportByMember.get(member.id) as any;
    const session = sessionByMember.get(member.id) as any;
    return {
      name: member.full_name?.split(" ")[0] || "Team",
      productivity: Math.round(Number(report?.productivity_score || 0)),
      focus: Math.round(Number(report?.focus_score || 0)),
      captures: Number(session?.screenshot_count || 0),
    };
  }), [data?.members, reportByMember, sessionByMember]);

  const categoryRows = useMemo(() => {
    const source = selectedReport?.time_by_category || {};
    return Object.entries(source).map(([name, minutes]) => ({ name: name.replace(/_/g, " "), minutes: Number(minutes || 0) }));
  }, [selectedReport]);

  async function runAction(action: string) {
    if (!memberId && action !== "purge_expired_screenshots") {
      appAlert("Select a team member first.");
      return;
    }
    setWorking(action);
    try {
      const res = await fetch("/api/admin/work-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, member_id: memberId, date, week_start: data?.week.week_start }),
      });
      const json = await res.json();
      if (!res.ok) {
        appAlert(json.error || "Action failed.");
        return;
      }
      await load();
    } finally {
      setWorking(null);
    }
  }

  function exportCsv() {
    if (!data) return;
    const header = ["Name", "Department", "Role", "Status", "Clock In", "Productivity", "Focus", "Overall", "Active Minutes", "Idle Minutes"];
    const rows = data.members.map((member) => {
      const report = reportByMember.get(member.id) as any;
      const entry = entryByMember.get(member.id) as any;
      const session = sessionByMember.get(member.id) as any;
      return [
        member.full_name,
        member.department || "",
        member.role_title || "",
        session?.status || "not tracking",
        entry?.clock_in_at || "",
        report?.productivity_score || "",
        report?.focus_score || "",
        report?.overall_score || "",
        report?.active_minutes || "",
        report?.idle_minutes || "",
      ];
    });
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cds-work-tracking-${data.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#F0F5FF] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1560px] space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0A4FE8]">HRM Intelligence</p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight text-[#0D1B39]">Work Tracking</h1>
            <p className="mt-2 text-sm text-gray-500">
              Productivity timelines, AI summaries, report comparison, and screenshot retention.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-11 rounded-xl border border-white bg-white px-3 text-sm outline-none"
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">Team member</span>
              <select
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                className="h-11 min-w-56 rounded-xl border border-white bg-white px-3 text-sm outline-none"
              >
                {(data?.members || []).map((member) => (
                  <option key={member.id} value={member.id}>{member.full_name}</option>
                ))}
              </select>
            </label>
            <button onClick={load} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white">
              <RefreshCw className="h-4 w-4" /> Apply
            </button>
            <button onClick={exportCsv} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0D1B39]">
              <Download className="h-4 w-4" /> CSV
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
              <Stat icon={Users} label="Tracked Members" value={String(data.stats.tracked_members || 0)} />
              <Stat icon={Clock} label="Active Sessions" value={String(data.stats.active_sessions || 0)} />
              <Stat icon={BarChart3} label="Avg Productivity" value={score(data.stats.average_productivity)} />
              <Stat icon={Brain} label="Avg Focus" value={score(data.stats.average_focus)} />
              <Stat icon={AlertTriangle} label="Burnout Risk" value={String(data.stats.high_burnout_risk || 0)} />
              <Stat icon={ShieldCheck} label="Screenshot Access" value={data.screenshot_access ? "Allowed" : "Restricted"} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#0A4FE8]" />
                  <h2 className="text-lg font-bold text-[#0D1B39]">Team Score Trends</h2>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="productivity" fill="#0A4FE8" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="focus" fill="#10B981" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#0A4FE8]" />
                    <h2 className="text-lg font-bold text-[#0D1B39]">Selected Member Focus</h2>
                  </div>
                  {selectedMember && <span className="text-xs font-semibold text-gray-500">{selectedMember.full_name}</span>}
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={categoryRows}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="minutes" stroke="#0A4FE8" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            <section className="overflow-hidden rounded-2xl border border-white/80 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0D1B39]">Daily Team Overview</h2>
                  <p className="mt-0.5 text-xs text-gray-500">{data.date}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton label="Daily Report" icon={Brain} loading={working === "generate_daily_report"} onClick={() => runAction("generate_daily_report")} />
                  <ActionButton label="Weekly Rollup" icon={CalendarDays} loading={working === "generate_weekly_report"} onClick={() => runAction("generate_weekly_report")} />
                  <ActionButton label="Compare" icon={FileSearch} loading={working === "compare_weekly_report"} onClick={() => runAction("compare_weekly_report")} />
                  <ActionButton label="Purge Expired" icon={Trash2} loading={working === "purge_expired_screenshots"} onClick={() => runAction("purge_expired_screenshots")} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Team member</th>
                      <th className="px-5 py-3">Attendance</th>
                      <th className="px-5 py-3">Tracking</th>
                      <th className="px-5 py-3">Scores</th>
                      <th className="px-5 py-3">Active time</th>
                      <th className="px-5 py-3">AI summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.members.map((member) => {
                      const entry = entryByMember.get(member.id) as any;
                      const session = sessionByMember.get(member.id) as any;
                      const report = reportByMember.get(member.id) as any;
                      const active = member.id === memberId;
                      return (
                        <tr
                          key={member.id}
                          onClick={() => setMemberId(member.id)}
                          className={`cursor-pointer align-top transition ${active ? "bg-blue-50/60" : "hover:bg-gray-50/70"}`}
                        >
                          <td className="px-5 py-4">
                            <p className="font-semibold text-[#0D1B39]">{member.full_name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{member.role_title || member.email}</p>
                            {member.department && <p className="text-xs text-gray-400">{member.department}</p>}
                          </td>
                          <td className="px-5 py-4">
                            <Badge>{entry?.attendance_status?.replace(/_/g, " ") || "no entry"}</Badge>
                            <p className="mt-2 text-xs text-gray-500">{shortTime(entry?.clock_in_at)} - {shortTime(entry?.clock_out_at)}</p>
                          </td>
                          <td className="px-5 py-4">
                            <Badge tone={session?.status === "active" ? "green" : session?.status === "paused" ? "amber" : "gray"}>
                              {session?.status || "not tracking"}
                            </Badge>
                            <p className="mt-2 text-xs text-gray-500">{Number(session?.screenshot_count || 0)} captures</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-bold text-[#0D1B39]">{score(report?.overall_score)}</p>
                            <p className="text-xs text-gray-500">P {score(report?.productivity_score)} · F {score(report?.focus_score)}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-[#0D1B39]">{minutesLabel(report?.active_minutes)}</p>
                            <p className="text-xs text-gray-500">Idle {minutesLabel(report?.idle_minutes)}</p>
                          </td>
                          <td className="max-w-xl px-5 py-4">
                            <p className="line-clamp-2 text-gray-600">{report?.summary || "No generated report yet."}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-3">
              <section className="rounded-2xl border border-white/80 bg-white xl:col-span-2">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-[#0D1B39]">Individual Timeline</h2>
                  <p className="mt-0.5 text-xs text-gray-500">{selectedMember?.full_name || "Select a team member"}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {selectedSnapshots.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-gray-400">No snapshots captured for this member on the selected date.</p>
                  ) : (
                    selectedSnapshots.map((snapshot) => (
                      <div key={snapshot.id} className="grid gap-4 px-5 py-4 md:grid-cols-[170px_1fr]">
                        <div className="h-28 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                          {snapshot.screenshot_url ? (
                            <img src={snapshot.screenshot_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full place-items-center text-xs text-gray-400">Metadata only</div>
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-[#0D1B39]">{shortTime(snapshot.captured_at)}</p>
                            {(snapshot.ai_categories || []).slice(0, 4).map((category: string) => (
                              <Badge key={category}>{category.replace(/_/g, " ")}</Badge>
                            ))}
                          </div>
                          <p className="mt-2 text-sm text-gray-600">{snapshot.ai_summary || "Analysis pending."}</p>
                          <p className="mt-2 text-xs text-gray-400">
                            {snapshot.active_app || "Browser"} · {snapshot.detected_projects?.[0] || snapshot.project_hint || "Unassigned"} · Retains until {snapshot.expires_at?.slice(0, 10)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <Panel title="Daily Analysis" icon={Brain}>
                  {selectedReport ? (
                    <div className="space-y-3">
                      <p className="text-sm leading-6 text-gray-600">{selectedReport.summary}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <MiniStat label="Overall" value={score(selectedReport.overall_score)} />
                        <MiniStat label="Meetings" value={minutesLabel(selectedReport.meeting_minutes)} />
                      </div>
                      <List title="Hidden achievements" items={selectedReport.hidden_achievements || []} />
                      <List title="Manager recommendations" items={selectedReport.manager_recommendations || []} />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Generate a daily report for this member.</p>
                  )}
                </Panel>

                <Panel title="Weekly Intelligence" icon={CalendarDays}>
                  {selectedWeekly ? (
                    <div className="space-y-3">
                      <p className="text-sm leading-6 text-gray-600">{selectedWeekly.summary}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <MiniStat label="Burnout" value={selectedWeekly.burnout_risk} />
                        <MiniStat label="Underuse" value={selectedWeekly.underutilization_risk} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Generate the weekly rollup after daily reports are available.</p>
                  )}
                </Panel>

                <Panel title="Report Comparison" icon={FileSearch}>
                  {selectedComparison ? (
                    <div className="space-y-3">
                      <p className="text-sm leading-6 text-gray-600">{selectedComparison.ai_summary}</p>
                      <MiniStat label="Confidence" value={score(selectedComparison.confidence_score)} />
                      <List title="Omissions" items={selectedComparison.omissions || []} />
                      <List title="Additional detected work" items={selectedComparison.additional_detected_work || []} />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Submit employee weekly report and generate weekly rollup, then compare.</p>
                  )}
                </Panel>
              </section>
            </div>

            <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Eye className="h-5 w-5 text-[#0A4FE8]" />
                <h2 className="text-lg font-bold text-[#0D1B39]">Privacy Access Log</h2>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {data.access_logs.map((log) => (
                  <div key={log.id} className="rounded-xl bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-[#0D1B39]">{log.action.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-xs text-gray-500">{log.actor_name || "System"} · {new Date(log.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, icon: Icon, loading, onClick }: { label: string; icon: any; loading?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 text-xs font-semibold text-[#0D1B39] shadow-sm disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
      <Icon className="h-5 w-5 text-[#0A4FE8]" />
      <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#0D1B39]">{value}</p>
    </div>
  );
}

function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "amber" | "gray" }) {
  const styles = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    gray: "bg-gray-100 text-gray-600",
  };
  return <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[tone]}`}>{children}</span>;
}

function Panel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-[#0A4FE8]" />
        <h2 className="text-lg font-bold text-[#0D1B39]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-bold capitalize text-[#0D1B39]">{value}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="mt-2 space-y-2">
        {items.slice(0, 5).map((item) => (
          <p key={item} className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">{item}</p>
        ))}
      </div>
    </div>
  );
}
