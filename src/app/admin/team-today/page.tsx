"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, Plus, X, Users, CalendarCheck,
} from "lucide-react";
import { toast } from "sonner";

interface Row {
    id: string; full_name: string; role_title: string | null; department: string | null; is_team_lead: boolean;
    attendance: any; tasks: { open: number; overdue: number; done_today: number };
    report_submitted: boolean; blockers: number; checklist: { done: number; total: number };
}
interface Data { work_date: string; summary: any; members: Row[] }

export default function TeamTodayPage() {
    const [data, setData] = useState<Data | null>(null);
    const [loading, setLoading] = useState(true);
    const [assignFor, setAssignFor] = useState<Row | null>(null);

    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/admin/team-today");
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed to load");
            setData(j);
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1400px]">
                <div className="mb-6 flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600"><Users className="h-6 w-6" /></span>
                    <div>
                        <h1 className="text-[22px] font-bold text-gray-900">Team Today</h1>
                        <p className="text-sm text-gray-500">Daily accountability - attendance, tasks, reports & blockers{data ? ` · ${new Date(data.work_date).toDateString()}` : ""}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-24 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : !data ? (
                    <p className="py-20 text-center text-gray-500">Could not load.</p>
                ) : (
                    <>
                        {/* Summary */}
                        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                            <Stat label="Team" value={data.summary.total} icon={<Users className="h-4 w-4" />} />
                            <Stat label="Checked in" value={data.summary.checked_in} icon={<Clock className="h-4 w-4" />} tone="green" />
                            <Stat label="Late" value={data.summary.late} icon={<AlertTriangle className="h-4 w-4" />} tone="amber" />
                            <Stat label="Reports in" value={data.summary.reports_submitted} icon={<CalendarCheck className="h-4 w-4" />} tone="blue" />
                            <Stat label="Overdue tasks" value={data.summary.overdue_tasks} icon={<AlertTriangle className="h-4 w-4" />} tone="red" />
                            <Stat label="Open blockers" value={data.summary.open_blockers} icon={<ShieldIcon />} tone="red" />
                        </div>

                        {/* Table */}
                        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                                        <tr>
                                            <th className="px-4 py-3">Member</th>
                                            <th className="px-4 py-3">Attendance</th>
                                            <th className="px-4 py-3 text-center">Tasks</th>
                                            <th className="px-4 py-3 text-center">Checklist</th>
                                            <th className="px-4 py-3 text-center">Report</th>
                                            <th className="px-4 py-3 text-center">Blockers</th>
                                            <th className="px-4 py-3 text-right">Assign</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {data.members.map((m) => {
                                            const clockedIn = !!m.attendance?.clock_in_at && !m.attendance?.clock_out_at;
                                            const att = m.attendance;
                                            return (
                                                <tr key={m.id} className="hover:bg-gray-50/60">
                                                    <td className="px-4 py-3">
                                                        <p className="font-semibold text-gray-900">{m.full_name}{m.is_team_lead && <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">LEAD</span>}</p>
                                                        <p className="text-[12px] text-gray-500">{m.role_title || "-"}{m.department ? ` · ${m.department}` : ""}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {att?.clock_in_at ? (
                                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${clockedIn ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"} ${att.attendance_status === "late" ? "bg-amber-100 text-amber-700" : ""}`}>
                                                                {att.attendance_status || (clockedIn ? "in" : "out")}
                                                            </span>
                                                        ) : <span className="text-[12px] text-gray-400">Not in</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-[12px]">
                                                        <span className="font-semibold text-gray-800">{m.tasks.open}</span> open
                                                        {m.tasks.overdue > 0 && <span className="ml-1 rounded bg-red-50 px-1 font-semibold text-red-600">{m.tasks.overdue} overdue</span>}
                                                        {m.tasks.done_today > 0 && <span className="ml-1 rounded bg-green-50 px-1 font-semibold text-green-600">{m.tasks.done_today} done</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-[12px] text-gray-700">{m.checklist.done}/{m.checklist.total}</td>
                                                    <td className="px-4 py-3 text-center">{m.report_submitted ? <CheckCircle2 className="mx-auto h-4 w-4 text-green-600" /> : <XCircle className="mx-auto h-4 w-4 text-gray-300" />}</td>
                                                    <td className="px-4 py-3 text-center">{m.blockers > 0 ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{m.blockers}</span> : <span className="text-gray-300">0</span>}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button onClick={() => setAssignFor(m)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"><Plus className="h-3.5 w-3.5" /> Task</button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {assignFor && <AssignModal member={assignFor} onClose={() => setAssignFor(null)} onDone={() => { setAssignFor(null); load(); }} />}
        </div>
    );
}

function Stat({ label, value, icon, tone = "gray" }: { label: string; value: number; icon: React.ReactNode; tone?: string }) {
    const tones: Record<string, string> = { gray: "text-gray-600 bg-gray-100", green: "text-green-600 bg-green-100", amber: "text-amber-600 bg-amber-100", blue: "text-blue-600 bg-blue-100", red: "text-red-600 bg-red-100" };
    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</div>
            <p className="text-[22px] font-bold text-gray-900">{value}</p>
            <p className="text-[12px] text-gray-500">{label}</p>
        </div>
    );
}

function ShieldIcon() { return <AlertTriangle className="h-4 w-4" />; }

function AssignModal({ member, onClose, onDone }: { member: Row; onClose: () => void; onDone: () => void }) {
    const [f, setF] = useState({ title: "", description: "", due_date: "", priority: "medium" });
    const [saving, setSaving] = useState(false);
    const submit = async () => {
        if (!f.title.trim()) return toast.error("Enter a task title");
        setSaving(true);
        try {
            const r = await fetch("/api/admin/team-today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", assignee_id: member.id, ...f }) });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed");
            toast.success(`Task assigned to ${member.full_name}`);
            onDone();
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                    <div><h3 className="text-[16px] font-bold text-gray-900">Assign task</h3><p className="text-[12px] text-gray-500">to {member.full_name}</p></div>
                    <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>
                <div className="space-y-3">
                    <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Task title" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                    <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Details (optional)" className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                    <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                        <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                            {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <button disabled={saving} onClick={submit} className="w-full rounded-full bg-gradient-to-b from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Assigning…" : "Assign task"}</button>
                </div>
            </div>
        </div>
    );
}
