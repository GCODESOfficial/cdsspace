"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Loader2, CheckCircle2, Circle, Clock, LogIn, LogOut, AlertTriangle,
    ClipboardList, Send, ListChecks, ShieldAlert, Plus, MapPin, Paperclip, X,
    Check, ChevronDown, Users, Search,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
    not_started: "Not started", in_progress: "In progress", under_review: "Under review",
    needs_revision: "Needs revision", approved: "Approved", completed: "Completed", delayed: "Delayed",
};
const STATUS_OPTIONS = ["not_started", "in_progress", "under_review", "delayed", "completed"];
const PRIORITY_COLORS: Record<string, string> = {
    urgent: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700",
    medium: "bg-blue-100 text-blue-700", low: "bg-gray-100 text-gray-600",
};

interface MyDay {
    member: { full_name: string; role_title: string | null; department: string | null; role_name: string | null };
    work_date: string;
    tasks: any[];
    done_today: any[];
    report: any;
    blockers: any[];
    checklist: { template_key: string; role_key: string; kind: string; label: string; done: boolean; evidence_link: string | null }[];
    attendance: any;
    can_assign: boolean;
}

export default function MyDayPage() {
    const [data, setData] = useState<MyDay | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [bypass, setBypass] = useState<{ show: boolean; distance?: number; code: string }>({ show: false, code: "" });

    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/team/my-day");
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed to load");
            setData(j);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const post = useCallback(async (payload: any) => {
        const r = await fetch("/api/team/my-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Request failed");
        return j;
    }, []);

    const updateTask = useCallback(async (taskId: string, status: string) => {
        try { await post({ action: "update_task", task_id: taskId, status }); toast.success("Task updated"); load(); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    }, [post, load]);

    const toggleChecklist = useCallback(async (item: any) => {
        setData((d) => d ? { ...d, checklist: d.checklist.map((c) => c.template_key === item.template_key ? { ...c, done: !c.done } : c) } : d);
        try { await post({ action: "toggle_checklist", template_key: item.template_key, done: !item.done }); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); load(); }
    }, [post, load]);

    const setEvidence = useCallback(async (item: any, link: string) => {
        try { await post({ action: "toggle_checklist", template_key: item.template_key, done: true, evidence_link: link }); toast.success("Evidence saved"); load(); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    }, [post, load]);

    const clock = useCallback(async (action: "clock_in" | "clock_out", code?: string) => {
        setBusy(true);
        try {
            const result = await new Promise<{ pos?: GeolocationPosition; code?: number }>((res) =>
                navigator.geolocation
                    ? navigator.geolocation.getCurrentPosition((p) => res({ pos: p }), (err) => res({ code: err.code }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 })
                    : res({}));
            const pos = result.pos ?? null;
            if (!pos && result.code === 1) {
                toast.error("Location permission is blocked. Allow location access for this site in your browser settings, then try again.");
            } else if (!pos && action === "clock_in") {
                toast.error("Could not get a GPS fix. Move near a window, turn off any VPN, and try again.");
            }
            const r = await fetch("/api/team/timebook", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, latitude: pos?.coords.latitude, longitude: pos?.coords.longitude, accuracy: pos?.coords.accuracy, ...(code ? { geofence_bypass_code: code } : {}) }),
            });
            const j = await r.json();
            if (!r.ok || j.ok === false) {
                if (j.allow_bypass) setBypass({ show: true, distance: j.distance_meters, code: "" });
                throw new Error(j.error || "Attendance failed");
            }
            setBypass({ show: false, code: "" });
            toast.success(action === "clock_in" ? "Clocked in" : "Clocked out");
            load();
        } catch (e) { toast.error(e instanceof Error ? e.message : "Attendance failed"); }
        finally { setBusy(false); }
    }, [load]);

    if (loading) return <div className="flex justify-center py-24 text-brand-body/40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    if (!data) return <div className="py-24 text-center text-brand-body/60">Could not load your day.</div>;

    const clockedIn = !!data.attendance?.clock_in_at && !data.attendance?.clock_out_at;
    const tasksTemplate = data.checklist.filter((c) => c.kind === "task");
    const evidenceTemplate = data.checklist.filter((c) => c.kind === "evidence");
    const doneCount = data.checklist.filter((c) => c.done).length;

    return (
        <div className="max-w-[1100px] space-y-5">
            {/* Header + attendance */}
            <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-blue-600 to-blue-800 p-5 text-white sm:p-7">
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">My Day · {new Date(data.work_date).toDateString()}</p>
                        <h1 className="mt-1 text-[26px] font-bold tracking-tight sm:text-[32px]">Hi, {data.member.full_name.split(" ")[0]}</h1>
                        <p className="mt-1 text-[13px] text-white/80">{data.member.role_name || data.member.role_title || "Team member"}{data.member.department ? ` · ${data.member.department}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${clockedIn ? "bg-green-400/20 text-green-100" : "bg-white/15 text-white/80"}`}>
                            <Clock className="h-3.5 w-3.5" /> {clockedIn ? "Checked in" : data.attendance?.clock_out_at ? "Checked out" : "Not checked in"}
                        </span>
                        {clockedIn ? (
                            <button disabled={busy} onClick={() => clock("clock_out")} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-brand-navy disabled:opacity-60">
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Check out
                            </button>
                        ) : (
                            <button disabled={busy} onClick={() => clock("clock_in")} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-brand-navy disabled:opacity-60">
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Check in
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {bypass.show && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-red-700"><MapPin className="h-4 w-4" /> You appear to be outside the office{bypass.distance != null ? ` (~${Math.round(bypass.distance)}m away)` : ""}.</div>
                    <div className="mt-2 flex gap-2">
                        <input value={bypass.code} onChange={(e) => setBypass({ ...bypass, code: e.target.value })} placeholder="Admin bypass code" className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-[13px] outline-none" />
                        <button disabled={!bypass.code || busy} onClick={() => clock("clock_in", bypass.code)} className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Clock in with code</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* Left: tasks + checklist */}
                <div className="space-y-5 lg:col-span-2">
                    {/* My tasks */}
                    <Card icon={<ClipboardList className="h-4 w-4" />} title="My tasks" subtitle={`${data.tasks.length} open · ${data.done_today.length} done today`}>
                        {data.tasks.length === 0 ? (
                            <p className="px-5 py-8 text-center text-[13px] text-brand-body/50">No open tasks assigned to you.</p>
                        ) : (
                            <ul className="divide-y divide-brand-stroke/20">
                                {data.tasks.map((t) => (
                                    <li key={t.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="truncate text-[14px] font-semibold text-brand-navy">{t.title}</p>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-brand-body/60">
                                                {t.project_title ? <span className="truncate">{t.project_title}</span> : <span className="text-brand-blue">Direct task</span>}
                                                {t.due_date && <span className={`rounded px-1.5 py-0.5 font-semibold ${new Date(t.due_date) < new Date(data.work_date) ? "bg-red-50 text-red-600" : "bg-gray-100"}`}>Due {t.due_date}</span>}
                                                <span className={`rounded px-1.5 py-0.5 font-semibold ${PRIORITY_COLORS[t.priority] || "bg-gray-100"}`}>{t.priority}</span>
                                                {t.attachment_url && (
                                                    <a href={t.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-brand-blue hover:underline">
                                                        <Paperclip className="h-3 w-3" /> {t.attachment_name || "Attachment"}
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                        <select value={t.status} onChange={(e) => updateTask(t.id, e.target.value)}
                                            className="shrink-0 rounded-lg border border-brand-stroke/50 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-brand-navy">
                                            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                        </select>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    {/* Role checklist */}
                    <Card icon={<ListChecks className="h-4 w-4" />} title="Compulsory daily tasks" subtitle={`${doneCount}/${data.checklist.length} done`}>
                        <div className="px-5 py-4">
                            <ul className="space-y-1.5">
                                {tasksTemplate.map((c) => (
                                    <li key={c.template_key}>
                                        <button onClick={() => toggleChecklist(c)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-bg">
                                            {c.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-brand-body/30" />}
                                            <span className={`text-[13px] leading-snug ${c.done ? "text-brand-body/40 line-through" : "text-brand-body"}`}>{c.label}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {evidenceTemplate.length > 0 && (
                                <div className="mt-4 border-t border-brand-stroke/20 pt-3">
                                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-blue">Required daily evidence</p>
                                    <ul className="space-y-2">
                                        {evidenceTemplate.map((c) => (
                                            <li key={c.template_key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                                                <div className="flex flex-1 items-start gap-2.5">
                                                    {c.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-brand-body/30" />}
                                                    <span className="text-[13px] leading-snug text-brand-body">{c.label}</span>
                                                </div>
                                                <EvidenceInput initial={c.evidence_link || ""} onSave={(link) => setEvidence(c, link)} />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </Card>

                    {data.can_assign && <AssignPanel onAssigned={load} />}
                </div>

                {/* Right: daily report + blockers */}
                <div className="space-y-5">
                    <DailyReport report={data.report} onSubmit={async (payload) => { await post({ action: "submit_report", ...payload }); toast.success("Daily report submitted"); load(); }} />
                    <BlockersCard blockers={data.blockers} onEscalate={async (payload) => { await post({ action: "escalate", ...payload }); toast.success("Blocker escalated to leads"); load(); }} />
                </div>
            </div>
        </div>
    );
}

/* ---------- sub-components ---------- */

function Card({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-brand-stroke/30 bg-white">
            <div className="flex items-center justify-between border-b border-brand-stroke/20 px-5 py-3.5">
                <div className="flex items-center gap-2 text-brand-navy"><span className="text-brand-blue">{icon}</span><span className="text-[14px] font-bold">{title}</span></div>
                {subtitle && <span className="text-[12px] font-medium text-brand-body/50">{subtitle}</span>}
            </div>
            {children}
        </div>
    );
}

function EvidenceInput({ initial, onSave }: { initial: string; onSave: (link: string) => void }) {
    const [v, setV] = useState(initial);
    return (
        <div className="flex items-center gap-1.5 sm:w-[46%]">
            <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Paste link…"
                className="w-full rounded-lg border border-brand-stroke/50 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-brand-blue" />
            <button onClick={() => v.trim() && onSave(v.trim())} className="shrink-0 rounded-lg bg-brand-blue px-2.5 py-1.5 text-[11px] font-semibold text-white">Save</button>
        </div>
    );
}

function DailyReport({ report, onSubmit }: { report: any; onSubmit: (p: any) => Promise<void> }) {
    const [f, setF] = useState({ completed: report?.completed || "", pending: report?.pending || "", blockers: report?.blockers || "", priorities: report?.priorities || "" });
    const [saving, setSaving] = useState(false);
    const submit = async () => { setSaving(true); try { await onSubmit(f); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); } };
    const field = (k: keyof typeof f, label: string, ph: string) => (
        <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-body/60">{label}</label>
            <textarea rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph}
                className="w-full resize-y rounded-lg border border-brand-stroke/50 bg-white px-3 py-2 text-[13px] outline-none focus:border-brand-blue" />
        </div>
    );
    return (
        <Card icon={<Send className="h-4 w-4" />} title="Daily close-of-work report" subtitle={report?.submitted_at ? "Submitted" : "Not submitted"}>
            <div className="space-y-3 px-5 py-4">
                {field("completed", "Completed today", "What you finished…")}
                {field("pending", "Still pending", "What's carried over…")}
                {field("blockers", "Blockers", "Anything blocking you…")}
                {field("priorities", "Next-day priorities", "Top priorities for tomorrow…")}
                <button disabled={saving} onClick={submit} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-blue-600 to-blue-700 px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {report ? "Update report" : "Submit report"}
                </button>
            </div>
        </Card>
    );
}

function BlockersCard({ blockers, onEscalate }: { blockers: any[]; onEscalate: (p: any) => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const [f, setF] = useState({ title: "", detail: "", severity: "medium" });
    const [saving, setSaving] = useState(false);
    const submit = async () => {
        if (!f.title.trim()) return;
        setSaving(true);
        try { await onEscalate(f); setF({ title: "", detail: "", severity: "medium" }); setOpen(false); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
    };
    return (
        <Card icon={<ShieldAlert className="h-4 w-4" />} title="Blockers" subtitle={`${blockers.length} open`}>
            <div className="px-5 py-4">
                {blockers.length > 0 && (
                    <ul className="mb-3 space-y-2">
                        {blockers.map((b) => (
                            <li key={b.id} className="rounded-lg bg-amber-50 px-3 py-2">
                                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> {b.title}</div>
                                {b.detail && <p className="mt-0.5 text-[12px] text-amber-700/80">{b.detail}</p>}
                            </li>
                        ))}
                    </ul>
                )}
                {open ? (
                    <div className="space-y-2">
                        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What's blocking you?" className="w-full rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px] outline-none focus:border-brand-blue" />
                        <textarea rows={2} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder="Details (optional)" className="w-full resize-y rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px] outline-none focus:border-brand-blue" />
                        <select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} className="w-full rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px]">
                            {["low", "medium", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <div className="flex gap-2">
                            <button disabled={saving} onClick={submit} className="flex-1 rounded-full bg-amber-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{saving ? "Escalating…" : "Escalate"}</button>
                            <button onClick={() => setOpen(false)} className="rounded-full border border-brand-stroke/50 px-4 py-2 text-[13px] font-semibold text-brand-body">Cancel</button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setOpen(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] font-semibold text-amber-700"><AlertTriangle className="h-4 w-4" /> Raise a blocker</button>
                )}
            </div>
        </Card>
    );
}

function AssignPanel({ onAssigned }: { onAssigned: () => void }) {
    const [members, setMembers] = useState<any[]>([]);
    const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [f, setF] = useState({ title: "", due_date: "", priority: "medium" });
    const [uploaded, setUploaded] = useState<{ url: string; name: string } | null>(null);
    const [link, setLink] = useState("");
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<HTMLDivElement>(null);
    useEffect(() => { fetch("/api/team/assign").then((r) => r.json()).then((j) => setMembers(j.members || [])).catch(() => {}); }, []);

    // Close the member picker when clicking outside it.
    useEffect(() => {
        if (!pickerOpen) return;
        const onDoc = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [pickerOpen]);

    const toggleMember = (id: string) => setAssigneeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    const q = search.trim().toLowerCase();
    const filtered = members.filter((m) => !q || (m.full_name || "").toLowerCase().includes(q) || (m.role_title || "").toLowerCase().includes(q));
    const selectedMembers = members.filter((m) => assigneeIds.includes(m.id));
    const selectAllVisible = () => setAssigneeIds((prev) => Array.from(new Set([...prev, ...filtered.map((m) => m.id)])));

    const upload = async (file: File) => {
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const r = await fetch("/api/team/assign/upload", { method: "POST", body: fd });
            const j = await r.json();
            if (!r.ok || !j.ok) throw new Error(j.error || "Upload failed");
            setUploaded({ url: j.url, name: j.name || file.name });
            setLink("");
        } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
        finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
    };

    const submit = async () => {
        if (assigneeIds.length === 0 || !f.title.trim()) return toast.error("Pick at least one member and enter a task");
        const attachmentUrl = uploaded?.url || link.trim();
        const attachmentName = uploaded?.name || link.trim();
        setSaving(true);
        try {
            const r = await fetch("/api/team/assign", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...f, assignee_ids: assigneeIds, attachment_url: attachmentUrl || null, attachment_name: attachmentName || null }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed");
            toast.success(assigneeIds.length > 1 ? `Task assigned to ${assigneeIds.length} members` : "Task assigned");
            setAssigneeIds([]);
            setF({ title: "", due_date: "", priority: "medium" });
            setUploaded(null);
            setLink("");
            setSearch("");
            onAssigned();
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
    };

    return (
        <Card icon={<Plus className="h-4 w-4" />} title="Assign a task" subtitle="Team lead">
            <div className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-2">
                <div ref={pickerRef} className="relative sm:col-span-2">
                    <button type="button" onClick={() => setPickerOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-lg border border-brand-stroke/50 px-3 py-2 text-left text-[13px]">
                        <Users className="h-4 w-4 shrink-0 text-brand-blue" />
                        {selectedMembers.length === 0 ? (
                            <span className="text-brand-body/40">Assign to…</span>
                        ) : (
                            <span className="flex flex-1 flex-wrap gap-1">
                                {selectedMembers.slice(0, 5).map((m) => (
                                    <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2 py-0.5 text-[12px] font-medium text-brand-blue">
                                        {m.full_name}
                                        <X className="h-3 w-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleMember(m.id); }} />
                                    </span>
                                ))}
                                {selectedMembers.length > 5 && <span className="self-center text-[12px] text-brand-body/60">+{selectedMembers.length - 5} more</span>}
                            </span>
                        )}
                        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-brand-body/40" />
                    </button>
                    {pickerOpen && (
                        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-brand-stroke/50 bg-white shadow-lg">
                            <div className="flex items-center gap-2 border-b border-brand-stroke/40 px-3 py-2">
                                <Search className="h-3.5 w-3.5 text-brand-body/40" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team members" className="flex-1 text-[13px] outline-none" autoFocus />
                            </div>
                            <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-brand-body/50">
                                <span>{selectedMembers.length} selected · {members.length} members</span>
                                <div className="flex gap-3">
                                    <button type="button" onClick={selectAllVisible} className="font-semibold text-brand-blue">Select all</button>
                                    {assigneeIds.length > 0 && <button type="button" onClick={() => setAssigneeIds([])} className="font-semibold text-brand-body/60">Clear</button>}
                                </div>
                            </div>
                            <div className="max-h-56 overflow-y-auto py-1">
                                {filtered.length === 0 ? (
                                    <p className="px-3 py-4 text-center text-[12px] text-brand-body/40">No members found.</p>
                                ) : filtered.map((m) => {
                                    const on = assigneeIds.includes(m.id);
                                    return (
                                        <button key={m.id} type="button" onClick={() => toggleMember(m.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-brand-bg/60">
                                            <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-brand-blue bg-brand-blue text-white" : "border-brand-stroke/60"}`}>{on && <Check className="h-3 w-3" />}</span>
                                            <span className="flex-1 truncate text-[13px] text-brand-navy">{m.full_name}{m.role_title ? <span className="text-brand-body/40"> · {m.role_title}</span> : null}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Task title" className="rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px] sm:col-span-2 outline-none focus:border-brand-blue" />
                <input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} className="rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px]" />
                <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px]">
                    {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>

                {/* Attachment: upload a photo/file OR paste a link */}
                <div className="sm:col-span-2 flex flex-col gap-2 rounded-lg border border-dashed border-brand-stroke/60 p-2.5">
                    {uploaded ? (
                        <div className="flex items-center gap-2 text-[13px]">
                            <Paperclip className="h-3.5 w-3.5 text-brand-blue" />
                            <a href={uploaded.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate font-medium text-brand-blue hover:underline">{uploaded.name}</a>
                            <button type="button" onClick={() => setUploaded(null)} className="rounded p-1 text-brand-body/50 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input ref={fileRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); }} />
                            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px] font-medium text-brand-navy disabled:opacity-60">
                                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />} {uploading ? "Uploading…" : "Upload photo/file"}
                            </button>
                            <span className="text-[11px] text-brand-body/40">or</span>
                            <input
                                value={link}
                                onChange={(e) => setLink(e.target.value)}
                                placeholder="Paste a link to an image or file"
                                className="flex-1 rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px] outline-none focus:border-brand-blue"
                            />
                        </div>
                    )}
                </div>

                <button disabled={saving || uploading} onClick={submit} className="rounded-full bg-brand-blue px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60 sm:col-span-2">{saving ? "Assigning…" : "Assign task"}</button>
            </div>
        </Card>
    );
}
