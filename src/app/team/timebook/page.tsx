"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Loader2, LogIn, LogOut, Coffee, Play, MapPin, CalendarPlus,
    Clock, CheckCircle2, History, Building2,
} from "lucide-react";
import { toast } from "sonner";

const CURRENT_STATUSES = [
    { key: "available", label: "Available" },
    { key: "busy", label: "Busy" },
    { key: "in_meeting", label: "In meeting" },
    { key: "on_break", label: "On break" },
];
const LEAVE_TYPES = ["annual", "sick", "emergency", "compassionate", "public_holiday", "unpaid"];
const ATT_COLORS: Record<string, string> = {
    early: "bg-green-100 text-green-700", on_time: "bg-green-100 text-green-700",
    late: "bg-amber-100 text-amber-700", half_day: "bg-orange-100 text-orange-700",
    absent: "bg-red-100 text-red-700", approved_leave: "bg-blue-100 text-blue-700",
};

function fmtTime(iso?: string | null) {
    if (!iso) return "-";
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
}
function fmtMinutes(min?: number | null) {
    if (!min) return "0h 0m";
    return `${Math.floor(min / 60)}h ${min % 60}m`;
}
function fmtDate(value?: string | null) {
    if (!value) return "-";
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return String(value);
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}
function lagosMinutesClient(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Lagos",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    return get("hour") * 60 + get("minute");
}
function isNightWorkWindow() {
    return lagosMinutesClient() >= 18 * 60 + 15;
}

export default function TimebookPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState("");
    const [bypass, setBypass] = useState<{ show: boolean; distance?: number; code: string }>({ show: false, code: "" });
    const [leave, setLeave] = useState({ leave_type: "annual", start_date: "", end_date: "", reason: "" });

    const load = useCallback(async () => {
        try {
            const r = await fetch("/api/team/timebook");
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || "Failed to load");
            setData(j);
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const geo = useCallback(async (fresh = false): Promise<{ latitude?: number; longitude?: number; accuracy?: number; captured_at?: string }> => {
        if (!navigator.geolocation) {
            toast.error("This browser has no location support - ask an admin for a bypass code.");
            return {};
        }
        const result = await new Promise<{ pos?: GeolocationPosition; code?: number }>((res) =>
            navigator.geolocation.getCurrentPosition(
                (p) => res({ pos: p }),
                (err) => res({ code: err.code }),
                { enableHighAccuracy: true, timeout: 12000, maximumAge: fresh ? 0 : 30000 },
            ));
        if (result.pos) {
            return {
                latitude: result.pos.coords.latitude,
                longitude: result.pos.coords.longitude,
                accuracy: result.pos.coords.accuracy,
                captured_at: new Date(result.pos.timestamp || Date.now()).toISOString(),
            };
        }
        if (result.code === 1) toast.error("Location permission is blocked. Allow location access for this site in your browser settings, then try again.");
        else toast.error("Could not get a GPS fix. Move near a window, turn off any VPN, and try again.");
        return {};
    }, []);

    const act = useCallback(async (action: string, extra: any = {}) => {
        setBusy(action);
        try {
            const withGeo = ["clock_in", "break_start", "break_end", "status_update", "location_ping"].includes(action) && !extra.skip_location;
            const body = { action, ...(withGeo ? await geo(action === "clock_in") : {}), ...extra };
            delete body.skip_location;
            const r = await fetch("/api/team/timebook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const j = await r.json();
            if (!j.ok) {
                if (j.allow_bypass) setBypass({ show: true, distance: j.distance_meters, code: "" });
                throw new Error(j.error || "Action failed");
            }
            setBypass({ show: false, code: "" });
            if (j.entry) {
                // Reflect the server-confirmed attendance immediately. This
                // prevents a stale render from briefly reverting the control.
                setData((current: any) => current ? { ...current, today: j.entry } : current);
            }
            if (action === "clock_in") {
                toast.success(j.message || "Clocked in");
                window.dispatchEvent(new CustomEvent("cds:clocked-in"));
                localStorage.setItem("cds:attendance-sync", JSON.stringify({ action: "clocked-in", at: Date.now() }));
            }
            else if (action === "clock_out") {
                toast.success(j.message || "Checked out. Your attendance has been recorded.");
                window.dispatchEvent(new CustomEvent("cds:clocked-out"));
                localStorage.setItem("cds:attendance-sync", JSON.stringify({ action: "clocked-out", at: Date.now() }));
            }
            else if (action === "request_leave") toast.success("Leave requested");
            else toast.success("Updated");
            await load();
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
        finally { setBusy(""); }
    }, [geo, load]);

    if (loading) return <div className="flex justify-center py-24 text-brand-body/40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    if (!data) return <div className="py-24 text-center text-brand-body/60">Could not load attendance.</div>;

    const today = data.today;
    const clockedIn = !!today?.clock_in_at && !today?.clock_out_at;
    const clockedOut = !!today?.clock_out_at;
    const automaticallyCheckedOut = clockedOut && Array.isArray(today?.flags) && today.flags.includes("auto_clock_out");
    const onBreak = today?.current_status === "on_break";
    const profile = data.profile || {};
    const maxSessions = data.max_sessions || 3;
    const sessionsUsed = data.sessions_used ?? (clockedIn || clockedOut ? 1 : 0);
    // After a checkout you can check back in until the daily session limit.
    const canCheckInAgain = clockedOut && sessionsUsed < maxSessions;
    const canNightCheckInAgain = canCheckInAgain && isNightWorkWindow();

    return (
        <div className="max-w-[1100px] space-y-5">
            {/* Hero status */}
            <div className="relative overflow-hidden rounded-[24px] bg-[#0A4FE8] p-5 text-white sm:p-7">
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Attendance · {new Date(data.work_date).toDateString()}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold ${clockedIn ? "bg-green-400/25 text-green-50" : "bg-white/15 text-white/80"}`}>
                                <Clock className="h-4 w-4" /> {clockedIn ? (onBreak ? "On break" : "Working") : automaticallyCheckedOut ? "Automatically checked out" : clockedOut ? "Checked out" : "Not checked in"}
                            </span>
                            {today?.attendance_status && (
                                <span className="rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-semibold capitalize">{String(today.attendance_status).replace(/_/g, " ")}</span>
                            )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-white/85">
                            <span>In: <b>{fmtTime(today?.clock_in_at)}</b></span>
                            <span>Out: <b>{fmtTime(today?.clock_out_at)}</b></span>
                            <span>Worked: <b>{fmtMinutes(today?.total_work_minutes)}</b></span>
                            {today?.overtime_minutes ? <span>OT: <b>{fmtMinutes(today.overtime_minutes)}</b></span> : null}
                            {sessionsUsed > 0 && <span>Sessions: <b>{sessionsUsed}/{maxSessions}</b></span>}
                        </div>
                    </div>
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end">
                        {((!clockedIn && !clockedOut) || canCheckInAgain) && (
                            <button disabled={!!busy} onClick={() => act("clock_in", { ...(bypass.code ? { geofence_bypass_code: bypass.code } : {}), ...(canNightCheckInAgain ? { skip_location: true } : {}) })}
                                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-bold text-brand-navy disabled:opacity-60">
                                {busy === "clock_in" ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />} {canCheckInAgain ? "Check in again" : "Check in"}
                            </button>
                        )}
                        {clockedIn && (
                            <>
                                {!onBreak ? (
                                    <button disabled={!!busy} onClick={() => act("break_start")} className="inline-flex items-center justify-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
                                        {busy === "break_start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coffee className="h-4 w-4" />} Start break
                                    </button>
                                ) : (
                                    <button disabled={!!busy} onClick={() => act("break_end")} className="inline-flex items-center justify-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
                                        {busy === "break_end" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} End break
                                    </button>
                                )}
                                <button disabled={!!busy} onClick={() => act("clock_out")} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-bold text-brand-navy disabled:opacity-60">
                                    {busy === "clock_out" ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />} Check out
                                </button>
                            </>
                        )}
                        {clockedOut && !canCheckInAgain && <span className="rounded-full bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white/80"><CheckCircle2 className="mr-1.5 inline h-4 w-4" />Day complete</span>}
                    </div>
                </div>
            </div>

            {automaticallyCheckedOut && (
                <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-[13px] text-blue-900">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0A4FE8]" />
                    <div>
                        <p className="font-semibold">Your attendance is recorded.</p>
                        <p className="mt-0.5 text-blue-800/80">The safety checkout closed this session at {fmtTime(today.clock_out_at)}. Your original check-in and worked time were preserved.</p>
                    </div>
                </div>
            )}

            {/* Geofence bypass banner */}
            {bypass.show && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-red-700"><MapPin className="h-4 w-4" /> You appear to be outside the office{bypass.distance != null ? ` (~${Math.round(bypass.distance)}m away)` : ""}.</div>
                    <div className="mt-2 flex gap-2">
                        <input value={bypass.code} onChange={(e) => setBypass({ ...bypass, code: e.target.value })} placeholder="Admin bypass code" className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-[13px] outline-none" />
                        <button disabled={!bypass.code || !!busy} onClick={() => act("clock_in", { geofence_bypass_code: bypass.code, ...(canNightCheckInAgain ? { skip_location: true } : {}) })} className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Clock in with code</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                    {clockedIn && (
                        <Card icon={<CheckCircle2 className="h-4 w-4" />} title="My status">
                            <div className="flex flex-wrap gap-2 px-5 py-4">
                                {CURRENT_STATUSES.map((s) => {
                                    const active = today?.current_status === s.key;
                                    return (
                                        <button key={s.key} disabled={!!busy || s.key === "on_break"} onClick={() => act("status_update", { status: s.key })}
                                            className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${active ? "bg-brand-blue text-white" : "border border-brand-stroke/50 bg-white text-brand-body hover:border-brand-blue/40"} ${s.key === "on_break" ? "opacity-50" : ""}`}>
                                            {s.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    <Card icon={<History className="h-4 w-4" />} title="Recent attendance" subtitle="This month">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-[13px]">
                                <thead className="bg-brand-bg text-[11px] uppercase tracking-wide text-brand-body/50">
                                    <tr><th className="px-5 py-2.5">Date</th><th className="px-4 py-2.5">In</th><th className="px-4 py-2.5">Out</th><th className="px-4 py-2.5">Worked</th><th className="px-4 py-2.5">Status</th></tr>
                                </thead>
                                <tbody className="divide-y divide-brand-stroke/20">
                                    {(data.history || []).length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-brand-body/50">No records yet.</td></tr>}
                                    {(data.history || []).map((h: any) => (
                                        <tr key={h.work_date}>
                                            <td className="px-5 py-2.5 font-semibold text-brand-navy">{new Date(h.work_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td>
                                            <td className="px-4 py-2.5">{fmtTime(h.clock_in_at)}</td>
                                            <td className="px-4 py-2.5">{fmtTime(h.clock_out_at)}</td>
                                            <td className="px-4 py-2.5">{fmtMinutes(h.total_work_minutes)}</td>
                                            <td className="px-4 py-2.5">{h.attendance_status ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${ATT_COLORS[h.attendance_status] || "bg-gray-100 text-gray-600"}`}>{String(h.attendance_status).replace(/_/g, " ")}</span> : "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>

                <div className="space-y-5">
                    <Card icon={<Building2 className="h-4 w-4" />} title="Work setup">
                        <div className="space-y-2.5 px-5 py-4 text-[13px]">
                            <Row label="Work mode" value={<span className="capitalize">{String(profile.work_mode || "onsite").replace(/_/g, " ")}</span>} />
                            <Row label="Office required today" value={data.office_required ? <span className="font-semibold text-amber-600">Yes</span> : <span className="text-green-600">No</span>} />
                            <div className="flex items-start gap-2 rounded-lg bg-brand-bg px-3 py-2 text-[12px] text-brand-body/70">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-blue" /> Clock-in uses your location; onsite requires being within the office geofence. Hours 09:00–18:00, lunch 13:00–14:00 (Mon–Fri).
                            </div>
                        </div>
                    </Card>

                    <Card icon={<CalendarPlus className="h-4 w-4" />} title="Request leave">
                        <div className="space-y-2.5 px-5 py-4">
                            <select value={leave.leave_type} onChange={(e) => setLeave({ ...leave, leave_type: e.target.value })} className="w-full rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px] capitalize">
                                {LEAVE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-2">
                                <input type="date" value={leave.start_date} onChange={(e) => setLeave({ ...leave, start_date: e.target.value })} className="rounded-lg border border-brand-stroke/50 px-2.5 py-2 text-[12px]" />
                                <input type="date" value={leave.end_date} onChange={(e) => setLeave({ ...leave, end_date: e.target.value })} className="rounded-lg border border-brand-stroke/50 px-2.5 py-2 text-[12px]" />
                            </div>
                            <textarea rows={2} value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} placeholder="Reason (optional)" className="w-full resize-y rounded-lg border border-brand-stroke/50 px-3 py-2 text-[13px]" />
                            <button disabled={busy === "request_leave" || !leave.start_date || !leave.end_date} onClick={() => act("request_leave", leave)} className="w-full rounded-full bg-brand-blue px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
                                {busy === "request_leave" ? "Requesting…" : "Request leave"}
                            </button>
                            {(data.leave_requests || []).length > 0 && (
                                <ul className="mt-2 space-y-1.5 border-t border-brand-stroke/20 pt-2">
                                    {(data.leave_requests || []).map((l: any) => (
                                        <li key={l.id} className="flex items-center justify-between text-[12px]">
                                            <span className="capitalize text-brand-body">{String(l.leave_type).replace(/_/g, " ")} · {fmtDate(l.start_date)} → {fmtDate(l.end_date)}</span>
                                            <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${l.status === "approved" ? "bg-green-100 text-green-700" : l.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{l.status || "pending"}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

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
function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return <div className="flex items-center justify-between"><span className="text-brand-body/60">{label}</span><span className="font-semibold text-brand-navy">{value}</span></div>;
}
