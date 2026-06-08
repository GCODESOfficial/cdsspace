"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  KeyRound,
  Loader2,
  MapPin,
  Save,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import { formatWorkMode, statusLabel, TIMEBOOK_OFFICE, WORK_MODES } from "@/lib/timebook";

interface TimebookEntry {
  id: string;
  team_member_id?: string;
  work_date?: string;
  attendance_status?: string;
  current_status?: string | null;
  clock_in_at?: string | null;
  clock_out_at?: string | null;
  total_work_minutes?: number | null;
  overtime_minutes?: number | null;
  clock_in_inside_geofence?: boolean | null;
  clock_in_distance_meters?: number | string | null;
  scores?: Record<string, number | string | null> | null;
  flags?: string[] | null;
}

interface LeaveRequest {
  id: string;
  status: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  team_members?: { full_name?: string | null } | null;
}

interface BypassCode {
  id: string;
  code_hint: string;
  status: string;
  reason?: string | null;
  expires_at: string;
  assigned_member?: { full_name?: string | null } | null;
}

interface TimebookRow {
  member: {
    id: string;
    full_name: string;
    email: string;
    role_title: string | null;
    department: string | null;
    work_mode?: string;
  };
  profile: {
    work_mode: string;
    hybrid_office_days: number[];
    flexible_break_enabled: boolean;
    approved_location_note: string | null;
    manager_note: string | null;
  };
  entry: TimebookEntry | null;
  leave: LeaveRequest | null;
  office_required: boolean;
  attendance_status: string;
  flags: string[];
}

interface TimebookData {
  date: string;
  from: string;
  to: string;
  rows: TimebookRow[];
  entries: TimebookEntry[];
  leave_requests: LeaveRequest[];
  bypass_codes: BypassCode[];
  stats: Record<string, number>;
}

const weekdayOptions = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
];

const statusStyles: Record<string, string> = {
  early: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  on_time: "bg-blue-50 text-blue-700 ring-blue-100",
  late: "bg-amber-50 text-amber-700 ring-amber-100",
  half_day: "bg-orange-50 text-orange-700 ring-orange-100",
  absent: "bg-red-50 text-red-700 ring-red-100",
  approved_leave: "bg-slate-100 text-slate-700 ring-slate-200",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shortTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AdminTimebookPage() {
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<TimebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [profileDrafts, setProfileDrafts] = useState<Record<string, TimebookRow["profile"]>>({});
  const [bypassMemberId, setBypassMemberId] = useState("");
  const [bypassReason, setBypassReason] = useState("GPS/geofence exception approved by super admin");
  const [bypassExpiry, setBypassExpiry] = useState(30);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date, from, to });
      const res = await fetch(`/api/admin/timebook?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        appAlert(json.error || "Could not load timebook.");
        return;
      }
      setData(json);
      const drafts: Record<string, TimebookRow["profile"]> = {};
      for (const row of json.rows ?? []) drafts[row.member.id] = row.profile;
      setProfileDrafts(drafts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = data?.rows ?? [];
  const entries = data?.entries ?? [];
  const pendingLeaves = useMemo(
    () => (data?.leave_requests ?? []).filter((leave) => leave.status === "pending"),
    [data?.leave_requests],
  );
  const bypassCodes = data?.bypass_codes ?? [];

  const saveProfile = async (memberId: string) => {
    const draft = profileDrafts[memberId];
    if (!draft) return;
    setSavingId(memberId);
    try {
      const res = await fetch("/api/admin/timebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_profile",
          member_id: memberId,
          ...draft,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        appAlert(json.error || "Could not save schedule.");
        return;
      }
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const reviewLeave = async (leaveId: string, status: "approved" | "rejected") => {
    const res = await fetch("/api/admin/timebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review_leave", leave_id: leaveId, status }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      appAlert(json.error || "Could not review leave.");
      return;
    }
    await load();
  };

  const generateBypassCode = async () => {
    setSavingId("bypass_code");
    setGeneratedCode(null);
    try {
      const res = await fetch("/api/admin/timebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_bypass_code",
          member_id: bypassMemberId || null,
          reason: bypassReason,
          expires_minutes: bypassExpiry,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        appAlert(json.error || "Could not generate bypass code.");
        return;
      }
      setGeneratedCode(json.code);
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const revokeBypassCode = async (codeId: string) => {
    const res = await fetch("/api/admin/timebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke_bypass_code", code_id: codeId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      appAlert(json.error || "Could not revoke bypass code.");
      return;
    }
    await load();
  };

  const updateDraft = (memberId: string, patch: Partial<TimebookRow["profile"]>) => {
    setProfileDrafts((current) => ({
      ...current,
      [memberId]: { ...(current[memberId] || {}), ...patch },
    }));
  };

  const exportCsv = () => {
    const header = [
      "Name",
      "Email",
      "Department",
      "Role",
      "Work Mode",
      "Date",
      "Attendance",
      "Clock In",
      "Clock Out",
      "Work Minutes",
      "Overtime Minutes",
      "Office Required",
      "Inside Geofence",
      "Distance Meters",
      "Flags",
    ];
    const lines = rows.map((row) => [
      row.member.full_name,
      row.member.email,
      row.member.department || "",
      row.member.role_title || "",
      formatWorkMode(row.profile.work_mode),
      data?.date || date,
      row.attendance_status,
      row.entry?.clock_in_at || "",
      row.entry?.clock_out_at || "",
      row.entry?.total_work_minutes ?? "",
      row.entry?.overtime_minutes ?? "",
      row.office_required ? "yes" : "no",
      row.entry?.clock_in_inside_geofence == null ? "" : row.entry.clock_in_inside_geofence ? "yes" : "no",
      row.entry?.clock_in_distance_meters ?? "",
      row.flags.join("|"),
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cds-timebook-${data?.date || date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F0F5FF] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0A4FE8]">HRM</p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight text-[#0D1B39]">Team Timebook</h1>
            <p className="mt-2 text-sm text-gray-500">
              {TIMEBOOK_OFFICE.address}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <FilterInput label="Report date" value={date} onChange={setDate} />
            <FilterInput label="From" value={from} onChange={setFrom} />
            <FilterInput label="To" value={to} onChange={setTo} />
            <button
              onClick={load}
              className="h-11 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20"
            >
              Apply
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white bg-white px-4 text-sm font-semibold text-[#0D1B39] shadow-sm"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-[360px] place-items-center rounded-2xl bg-white">
            <Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Stat icon={UserCheck} label="Team" value={String(data?.stats.total ?? 0)} />
              <Stat icon={CheckCircle2} label="On time" value={String((data?.stats.early ?? 0) + (data?.stats.on_time ?? 0))} />
              <Stat icon={Clock} label="Late / Half day" value={String((data?.stats.late ?? 0) + (data?.stats.half_day ?? 0))} />
              <Stat icon={XCircle} label="Absent" value={String(data?.stats.absent ?? 0)} />
              <Stat icon={AlertTriangle} label="Flagged" value={String(data?.stats.flagged ?? 0)} />
            </div>

            {pendingLeaves.length > 0 && (
              <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-[#0A4FE8]" />
                  <h2 className="text-lg font-bold text-[#0D1B39]">Pending Leave Requests</h2>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {pendingLeaves.map((leave) => (
                    <div key={leave.id} className="rounded-xl border border-gray-100 p-4">
                      <p className="text-sm font-bold text-[#0D1B39]">{leave.team_members?.full_name || "Team member"}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatWorkMode(leave.leave_type)} · {leave.start_date} to {leave.end_date}
                      </p>
                      {leave.reason && <p className="mt-2 text-sm text-gray-600">{leave.reason}</p>}
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => reviewLeave(leave.id, "approved")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Approve</button>
                        <button onClick={() => reviewLeave(leave.id, "rejected")} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#0A4FE8]" />
                <h2 className="text-lg font-bold text-[#0D1B39]">Geofence Bypass Codes</h2>
              </div>
              <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="space-y-3">
                    <select
                      value={bypassMemberId}
                      onChange={(event) => setBypassMemberId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none"
                    >
                      <option value="">Any team member</option>
                      {rows.map((row) => (
                        <option key={row.member.id} value={row.member.id}>{row.member.full_name}</option>
                      ))}
                    </select>
                    <input
                      value={bypassReason}
                      onChange={(event) => setBypassReason(event.target.value)}
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none"
                      placeholder="Reason"
                    />
                    <select
                      value={bypassExpiry}
                      onChange={(event) => setBypassExpiry(Number(event.target.value))}
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={240}>4 hours</option>
                      <option value={720}>12 hours</option>
                      <option value={1440}>1 day</option>
                      <option value={4320}>3 days</option>
                      <option value={7200}>5 days</option>
                    </select>
                    <button
                      onClick={generateBypassCode}
                      disabled={savingId === "bypass_code"}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savingId === "bypass_code" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      Generate Code
                    </button>
                    {generatedCode && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Reusable until expiry</p>
                        <p className="mt-1 font-mono text-2xl font-bold tracking-wide text-emerald-800">{generatedCode}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {bypassCodes.length === 0 ? (
                    <p className="text-sm text-gray-500">No bypass codes generated yet.</p>
                  ) : (
                    bypassCodes.map((code) => (
                      <div key={code.id} className="rounded-xl border border-gray-100 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-sm font-bold text-[#0D1B39]">{code.code_hint}</p>
                            <p className="mt-1 text-xs text-gray-500">{code.assigned_member?.full_name || "Any team member"}</p>
                          </div>
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-600">{code.status}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-gray-500">{code.reason}</p>
                        <p className="mt-2 text-xs text-gray-400">Expires {new Date(code.expires_at).toLocaleString()}</p>
                        {code.status === "active" && (
                          <button
                            onClick={() => revokeBypassCode(code.id)}
                            className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/80 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-lg font-bold text-[#0D1B39]">Daily Attendance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="bg-gray-50/80 text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Team member</th>
                      <th className="px-5 py-3">Schedule</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Time</th>
                      <th className="px-5 py-3">Location</th>
                      <th className="px-5 py-3">Scores</th>
                      <th className="px-5 py-3">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => {
                      const draft = profileDrafts[row.member.id] || row.profile;
                      return (
                        <tr key={row.member.id} className="align-top">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-[#0D1B39]">{row.member.full_name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{row.member.role_title || row.member.email}</p>
                            {row.member.department && <p className="text-xs text-gray-400">{row.member.department}</p>}
                          </td>
                          <td className="px-5 py-4">
                            <div className="space-y-2">
                              <select
                                value={draft.work_mode}
                                onChange={(event) => updateDraft(row.member.id, { work_mode: event.target.value })}
                                className="h-9 w-44 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold outline-none"
                              >
                                {WORK_MODES.map((mode) => (
                                  <option key={mode} value={mode}>{formatWorkMode(mode)}</option>
                                ))}
                              </select>
                              {draft.work_mode === "hybrid" && (
                                <div className="flex flex-wrap gap-1.5">
                                  {weekdayOptions.map((day) => {
                                    const active = (draft.hybrid_office_days || []).includes(day.value);
                                    return (
                                      <button
                                        key={day.value}
                                        type="button"
                                        onClick={() => {
                                          const current = draft.hybrid_office_days || [];
                                          updateDraft(row.member.id, {
                                            hybrid_office_days: active
                                              ? current.filter((value) => value !== day.value)
                                              : [...current, day.value].sort(),
                                          });
                                        }}
                                        className={`rounded-md px-2 py-1 text-[10px] font-bold ${active ? "bg-[#0A4FE8] text-white" : "bg-gray-100 text-gray-500"}`}
                                      >
                                        {day.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              <button
                                onClick={() => saveProfile(row.member.id)}
                                disabled={savingId === row.member.id}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                              >
                                {savingId === row.member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                Save
                              </button>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${statusStyles[row.attendance_status] || statusStyles.absent}`}>
                              {statusLabel(row.attendance_status)}
                            </span>
                            <p className="mt-2 text-xs text-gray-500">{statusLabel(row.entry?.current_status || (row.entry ? "available" : "offline"))}</p>
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-600">
                            <p>In: <span className="font-semibold text-[#0D1B39]">{shortTime(row.entry?.clock_in_at)}</span></p>
                            <p className="mt-1">Out: <span className="font-semibold text-[#0D1B39]">{shortTime(row.entry?.clock_out_at)}</span></p>
                            <p className="mt-1">{row.entry?.total_work_minutes ?? 0} work mins · {row.entry?.overtime_minutes ?? 0} overtime</p>
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-600">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-gray-400" />
                              {row.office_required ? "Office required" : "Flexible"}
                            </div>
                            <p className="mt-1">
                              {row.entry?.clock_in_distance_meters == null ? "-" : `${Math.round(Number(row.entry.clock_in_distance_meters))}m from HQ`}
                            </p>
                            <p className={row.entry?.clock_in_inside_geofence ? "mt-1 text-emerald-600" : "mt-1 text-gray-400"}>
                              {row.entry?.clock_in_inside_geofence ? "Inside geofence" : "Not verified"}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-600">
                            <p>Attendance: {row.entry?.scores?.attendance ?? "-"}</p>
                            <p className="mt-1">Punctuality: {row.entry?.scores?.punctuality ?? "-"}</p>
                            <p className="mt-1 font-semibold text-[#0D1B39]">Productivity: {row.entry?.scores?.productivity ?? "-"}</p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex max-w-[220px] flex-wrap gap-1.5">
                              {row.flags.length === 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                                  <ShieldCheck className="h-3 w-3" /> Clear
                                </span>
                              ) : (
                                row.flags.map((flag) => (
                                  <span key={flag} className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600">
                                    {flag.replace(/_/g, " ")}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-[#0D1B39]">Range Activity</h2>
              {entries.length === 0 ? (
                <p className="text-sm text-gray-500">No entries in this range.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {entries.slice(0, 12).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-gray-100 p-4">
                      <p className="text-sm font-bold text-[#0D1B39]">{entry.work_date}</p>
                      <p className="mt-1 text-xs text-gray-500">{statusLabel(entry.attendance_status)} · {entry.total_work_minutes || 0} minutes</p>
                      <p className="mt-2 text-xs text-gray-400">{entry.flags?.join(", ") || "No flags"}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function FilterInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border border-white bg-white px-3 text-sm font-semibold text-[#0D1B39] shadow-sm outline-none"
      />
    </label>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0A4FE8]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-bold text-[#0D1B39]">{value}</p>
    </div>
  );
}
