"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Fingerprint, UserCheck, LogIn, LogOut, BookOpen, Loader2, ScanLine,
  Plus, Trash2, RefreshCw, Wifi, WifiOff, Cpu, Search, Download,
  CheckCircle2, AlertTriangle, Clock, TrendingUp, Settings2, X,
} from "lucide-react";
import { appAlert, appToast, appConfirm } from "@/lib/app-notify";
import {
  FINGER_LABELS, formatFinger, MATCH_SCORE_THRESHOLD,
} from "@/lib/biometric/constants";
import {
  probeBridge, bridgeSync, bridgeCapture, bridgeIdentify,
  simulateCapture, simulateIdentify,
  getBridgeUrl, setBridgeUrl,
  type BridgeMode, type BridgeHealth, type CaptureResult,
} from "@/lib/biometric/bridge-client";
import { efficiencyBand } from "@/lib/biometric/performance";

/* ─────────────── Types ─────────────── */

interface Member {
  id: string; full_name: string; username: string; email: string;
  role_title: string | null; department: string | null; avatar_url: string | null;
  enrolled_fingers: number; finger_labels: string[]; last_enrolled_at: string | null;
}
interface TodayRow {
  id: string; team_member_id: string; full_name: string; role_title: string | null;
  avatar_url: string | null; check_in_at: string | null; check_out_at: string | null;
  attendance_status: string; total_work_minutes: number; overtime_minutes: number;
  check_in_match_score: number | null;
}
interface Dashboard {
  work_date: string; members: Member[]; today: TodayRow[];
  recent_events: { id: string; full_name: string | null; event_type: string; created_at: string }[];
  stats: { team: number; enrolled: number; checked_in: number; checked_out: number; on_time: number; late: number };
}
interface BookletEntry {
  member: { id: string; full_name: string; role_title: string | null; department: string | null };
  summary: {
    work_days: number; present_days: number; on_time_days: number; early_days: number;
    late_days: number; half_days: number; absent_days: number; leave_days: number;
    incomplete_days: number; total_work_minutes: number; total_overtime_minutes: number;
    avg_work_minutes: number; attendance_rate: number; punctuality_rate: number;
    avg_productivity: number; efficiency_score: number;
  };
  days: { work_date: string; check_in_at: string | null; check_out_at: string | null; attendance_status: string; total_work_minutes: number | null; overtime_minutes: number | null }[];
}

type Tab = "checkin" | "checkout" | "enroll" | "booklet";

/* ─────────────── Helpers ─────────────── */

function fmtTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });
}
function fmtHours(min: number | null | undefined) {
  const m = Number(min || 0);
  if (m <= 0) return "0h";
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const STATUS_META: Record<string, { label: string; cls: string }> = {
  early: { label: "Early", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  on_time: { label: "On time", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  late: { label: "Late", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  half_day: { label: "Half day", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  absent: { label: "Absent", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  approved_leave: { label: "Leave", cls: "bg-blue-50 text-blue-700 border-blue-200" },
};
const BAND_META: Record<string, { label: string; cls: string }> = {
  excellent: { label: "Excellent", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  solid: { label: "Solid", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  watch: { label: "Watch", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  at_risk: { label: "At risk", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

async function api(action: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/admin/biometric", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
  return json;
}

/* ─────────────── Page ─────────────── */

export default function TimeMachinePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("checkin");
  const [bridge, setBridge] = useState<{ mode: BridgeMode; health: BridgeHealth | null }>({ mode: "offline", health: null });
  const [simulator, setSimulator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const effectiveMode: BridgeMode = simulator ? "simulator" : bridge.mode;
  const deviceLabel = bridge.health?.device?.model || (effectiveMode === "simulator" ? "Simulator" : "Time Machine Station");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/biometric", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not load station.");
      setData(json);
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not load station.");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/biometric?view=templates", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (json.ok) await bridgeSync(json.templates || []);
    } catch {
      // Bridge may be offline; identify will surface that to the operator.
    }
  }, []);

  const probe = useCallback(async () => {
    const health = await probeBridge();
    if (health?.device) {
      setBridge({ mode: "hardware", health });
      await syncTemplates();
    } else {
      setBridge({ mode: "offline", health: null });
    }
  }, [syncTemplates]);

  useEffect(() => { load(); probe(); }, [load, probe]);

  return (
    <div className="min-h-screen bg-[#F0F5FF] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1280px]">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0A4FE8]">HRM</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[#0D1B39] md:text-3xl">
              <Fingerprint className="h-7 w-7 text-[#0A4FE8]" /> Time Machine Portal
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              ZKTeco fingerprint station for biometric check-in / check-out. Enrollment and attendance here feed the performance &amp; efficiency booklet.
            </p>
          </div>
          <DeviceBar
            mode={effectiveMode}
            health={bridge.health}
            simulator={simulator}
            onReconnect={probe}
            onToggleSimulator={() => setSimulator((s) => !s)}
            onSettings={() => setShowSettings(true)}
          />
        </div>

        {/* Stats */}
        {data && (
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
            <Stat icon={UserCheck} label="Team" value={data.stats.team} />
            <Stat icon={Fingerprint} label="Enrolled" value={data.stats.enrolled} />
            <Stat icon={LogIn} label="Checked in" value={data.stats.checked_in} />
            <Stat icon={LogOut} label="Checked out" value={data.stats.checked_out} />
            <Stat icon={CheckCircle2} label="On time" value={data.stats.on_time} tone="emerald" />
            <Stat icon={AlertTriangle} label="Late" value={data.stats.late} tone="amber" />
          </div>
        )}

        {/* Tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          <TabButton active={tab === "checkin"} onClick={() => setTab("checkin")} icon={LogIn} label="Check-in" />
          <TabButton active={tab === "checkout"} onClick={() => setTab("checkout")} icon={LogOut} label="Check-out" />
          <TabButton active={tab === "enroll"} onClick={() => setTab("enroll")} icon={Plus} label="Enroll" />
          <TabButton active={tab === "booklet"} onClick={() => setTab("booklet")} icon={BookOpen} label="Attendance Booklet" />
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>
        ) : !data ? null : tab === "enroll" ? (
          <EnrollTab data={data} mode={effectiveMode} onReload={load} onSync={syncTemplates} />
        ) : tab === "booklet" ? (
          <BookletTab />
        ) : (
          <ScanTab key={tab} intent={tab === "checkin" ? "check_in" : "check_out"} data={data} mode={effectiveMode} deviceLabel={deviceLabel} onReload={load} />
        )}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSaved={probe} />}
    </div>
  );
}

/* ─────────────── Device bar ─────────────── */

function DeviceBar({ mode, health, simulator, onReconnect, onToggleSimulator, onSettings }: {
  mode: BridgeMode; health: BridgeHealth | null; simulator: boolean;
  onReconnect: () => void; onToggleSimulator: () => void; onSettings: () => void;
}) {
  const dot = mode === "hardware" ? "bg-emerald-500" : mode === "simulator" ? "bg-amber-500" : "bg-rose-500";
  const Icon = mode === "hardware" ? Wifi : mode === "simulator" ? Cpu : WifiOff;
  const label = mode === "hardware"
    ? `${health?.device?.model || "Scanner"} connected`
    : mode === "simulator" ? "Simulator mode" : "Scanner offline";
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white bg-white p-2 shadow-sm">
      <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <Icon className="h-4 w-4 text-gray-500" />
        <span className="text-[13px] font-semibold text-[#0D1B39]">{label}</span>
      </div>
      <button onClick={onReconnect} title="Reconnect scanner" className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:text-[#0A4FE8]">
        <RefreshCw className="h-4 w-4" />
      </button>
      <button onClick={onToggleSimulator} className={`rounded-xl px-3 py-2 text-[12.5px] font-semibold transition ${simulator ? "bg-amber-100 text-amber-700" : "border border-gray-200 text-gray-500 hover:text-[#0A4FE8]"}`}>
        {simulator ? "Simulator on" : "Use simulator"}
      </button>
      <button onClick={onSettings} title="Bridge settings" className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:text-[#0A4FE8]">
        <Settings2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone = "blue" }: { icon: React.ElementType; label: string; value: number; tone?: "blue" | "emerald" | "amber" }) {
  const cls = tone === "emerald" ? "bg-emerald-50 text-emerald-600" : tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-[#0A4FE8]";
  return (
    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${cls}`}><Icon className="h-4 w-4" /></div>
      <p className="text-xl font-bold text-[#0D1B39]">{value}</p>
      <p className="text-[12px] text-gray-500">{label}</p>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition ${active ? "bg-[#0A4FE8] text-white shadow-md shadow-blue-200" : "border border-white bg-white text-gray-500 hover:text-[#0A4FE8]"}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

/* ─────────────── Scan tab (check-in / check-out) ─────────────── */

function ScanTab({ intent, data, mode, deviceLabel, onReload }: {
  intent: "check_in" | "check_out"; data: Dashboard; mode: BridgeMode; deviceLabel: string; onReload: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "warn" | "err"; title: string; sub: string } | null>(null);
  const [simMember, setSimMember] = useState("");

  const enrolled = useMemo(() => data.members.filter((m) => m.enrolled_fingers > 0), [data.members]);
  const isCheckIn = intent === "check_in";

  async function record(memberId: string, finger: string | null, score: number | null, quality: number | null) {
    const json = await api(intent, { member_id: memberId, finger, match_score: score, quality, device_label: deviceLabel });
    const name = json.member?.full_name || "Team member";
    if (json.state === "checked_in") {
      const meta = STATUS_META[json.status] || { label: json.status };
      setResult({ tone: json.status === "late" || json.status === "half_day" ? "warn" : "ok", title: `Welcome, ${name}`, sub: `Checked in at ${fmtTime(json.entry?.check_in_at)} · ${meta.label}` });
    } else if (json.state === "checked_out") {
      setResult({ tone: "ok", title: `Goodbye, ${name}`, sub: `Checked out · ${fmtHours(json.total_work_minutes)} worked${json.overtime_minutes ? ` · ${fmtHours(json.overtime_minutes)} OT` : ""}${json.early_logout ? " · early logout" : ""}` });
    } else if (json.state === "already_checked_in") {
      setResult({ tone: "warn", title: `${name} already checked in`, sub: `At ${fmtTime(json.check_in_at)}` });
    } else if (json.state === "already_checked_out") {
      setResult({ tone: "warn", title: `${name} already checked out`, sub: `At ${fmtTime(json.check_out_at)}` });
    } else if (json.state === "not_checked_in") {
      setResult({ tone: "err", title: `No check-in for ${name}`, sub: "Run a check-in first before checking out." });
    }
    appToast(`${name} · ${isCheckIn ? "check-in" : "check-out"} recorded`);
    onReload();
  }

  async function scan() {
    setResult(null);
    setScanning(true);
    try {
      if (mode === "simulator") {
        if (!simMember) { appAlert("Pick a member to simulate the scan."); return; }
        const m = enrolled.find((x) => x.id === simMember);
        const finger = m?.finger_labels?.[0] || "right_thumb";
        const sim = simulateIdentify(simMember, finger);
        await record(simMember, sim.finger ?? finger, sim.score ?? null, sim.quality ?? null);
      } else if (mode === "hardware") {
        const r = await bridgeIdentify();
        if (!r.matched || !r.memberId) {
          setResult({ tone: "err", title: "Fingerprint not recognized", sub: "Not enrolled, or scan quality too low. Try again." });
          return;
        }
        if ((r.score ?? 0) < MATCH_SCORE_THRESHOLD) {
          setResult({ tone: "err", title: "Low match score", sub: `Score ${Math.round(r.score ?? 0)} below threshold. Re-scan or re-enroll.` });
          return;
        }
        await record(r.memberId, r.finger ?? null, r.score ?? null, r.quality ?? null);
      } else {
        appAlert("No scanner connected. Reconnect the ZKTeco reader, or switch on Simulator mode.");
      }
    } catch (e) {
      setResult({ tone: "err", title: "Scan failed", sub: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setScanning(false);
    }
  }

  const todayList = data.today.filter((r) => (isCheckIn ? r.check_in_at : r.check_out_at));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Scan panel */}
      <div className="rounded-2xl border border-white bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col items-center text-center">
          <h2 className="text-lg font-bold text-[#0D1B39]">{isCheckIn ? "Scan to Check In" : "Scan to Check Out"}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {mode === "simulator" ? "Simulator: choose the member, then run the scan." : "Place the enrolled finger on the ZKTeco reader."}
          </p>

          {mode === "simulator" && (
            <select value={simMember} onChange={(e) => setSimMember(e.target.value)} className="mt-4 w-full max-w-xs rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
              <option value="">Select member to simulate…</option>
              {enrolled.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}

          <button
            onClick={scan}
            disabled={scanning}
            className={`group mt-6 flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-full text-white shadow-xl transition disabled:opacity-70 ${isCheckIn ? "bg-gradient-to-br from-[#0035C1] to-[#0575FF] shadow-blue-300" : "bg-gradient-to-br from-[#0D1B39] to-[#334155] shadow-slate-300"}`}
          >
            {scanning ? <Loader2 className="h-12 w-12 animate-spin" /> : <ScanLine className="h-12 w-12 transition group-hover:scale-110" />}
            <span className="text-sm font-semibold">{scanning ? "Scanning…" : isCheckIn ? "Check In" : "Check Out"}</span>
          </button>

          {result && (
            <div className={`mt-6 w-full max-w-md rounded-2xl border p-4 text-left ${result.tone === "ok" ? "border-emerald-200 bg-emerald-50" : result.tone === "warn" ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"}`}>
              <div className="flex items-center gap-2">
                {result.tone === "ok" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : result.tone === "warn" ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <X className="h-5 w-5 text-rose-600" />}
                <p className="font-bold text-[#0D1B39]">{result.title}</p>
              </div>
              <p className="mt-1 pl-7 text-sm text-gray-600">{result.sub}</p>
            </div>
          )}
        </div>
      </div>

      {/* Today list */}
      <div className="rounded-2xl border border-white bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-[#0D1B39]">{isCheckIn ? "Checked in today" : "Checked out today"}</h3>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-[#0A4FE8]">{todayList.length}</span>
        </div>
        <div className="max-h-[520px] space-y-2 overflow-y-auto">
          {todayList.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No {isCheckIn ? "check-ins" : "check-outs"} yet today.</p>
          ) : todayList.map((r) => {
            const meta = STATUS_META[r.attendance_status] || { label: r.attendance_status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
            return (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0D1B39]">{r.full_name}</p>
                  <p className="text-[11px] text-gray-400">{r.role_title || "Team"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#0D1B39]">{fmtTime(isCheckIn ? r.check_in_at : r.check_out_at)}</p>
                  <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Enroll tab ─────────────── */

function EnrollTab({ data, mode, onReload, onSync }: { data: Dashboard; mode: BridgeMode; onReload: () => void; onSync: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [finger, setFinger] = useState<string>("right_thumb");
  const [captured, setCaptured] = useState<CaptureResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.members.filter((m) => !q || m.full_name.toLowerCase().includes(q) || (m.role_title || "").toLowerCase().includes(q) || (m.department || "").toLowerCase().includes(q));
  }, [data.members, query]);
  const selected = data.members.find((m) => m.id === selectedId) || null;

  async function capture() {
    setCaptured(null);
    setCapturing(true);
    try {
      if (mode === "hardware") setCaptured(await bridgeCapture());
      else if (mode === "simulator") setCaptured(simulateCapture());
      else appAlert("No scanner connected. Reconnect the ZKTeco reader, or switch on Simulator mode.");
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Capture failed.");
    } finally {
      setCapturing(false);
    }
  }

  async function save() {
    if (!selected || !captured) return;
    setSaving(true);
    try {
      await api("enroll", {
        member_id: selected.id, finger, template: captured.template,
        format: captured.format, quality: captured.quality, device_label: "Time Machine Station",
      });
      appToast(`${selected.full_name} · ${formatFinger(finger)} enrolled`);
      setCaptured(null);
      onReload();
      onSync();
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not save enrollment.");
    } finally {
      setSaving(false);
    }
  }

  async function removeFinger(memberId: string, fingerLabel: string) {
    const ok = await appConfirm(`Remove ${formatFinger(fingerLabel)} enrollment?`);
    if (!ok) return;
    try {
      await api("unenroll", { member_id: memberId, finger: fingerLabel });
      appToast("Fingerprint removed");
      onReload();
      onSync();
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not remove fingerprint.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* Member list */}
      <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search team members" className="w-full bg-transparent text-sm outline-none" />
        </div>
        <div className="max-h-[560px] space-y-1 overflow-y-auto">
          {filtered.map((m) => (
            <button key={m.id} onClick={() => { setSelectedId(m.id); setCaptured(null); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${selectedId === m.id ? "bg-[#0A4FE8] text-white" : "hover:bg-gray-50"}`}>
              <div className="min-w-0">
                <p className={`truncate text-sm font-semibold ${selectedId === m.id ? "text-white" : "text-[#0D1B39]"}`}>{m.full_name}</p>
                <p className={`truncate text-[11px] ${selectedId === m.id ? "text-blue-100" : "text-gray-400"}`}>{m.role_title || "Team"}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${m.enrolled_fingers > 0 ? (selectedId === m.id ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700") : (selectedId === m.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400")}`}>
                {m.enrolled_fingers > 0 ? `${m.enrolled_fingers} ✓` : "none"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Enroll panel */}
      <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
        {!selected ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-gray-400">
            <Fingerprint className="mb-3 h-12 w-12 text-gray-200" />
            <p className="text-sm">Select a team member to enroll their fingerprint.</p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#0D1B39]">{selected.full_name}</h2>
                <p className="text-sm text-gray-500">{selected.role_title || "Team"}{selected.department ? ` · ${selected.department}` : ""}</p>
              </div>
              {selected.enrolled_fingers > 0 && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{selected.enrolled_fingers} enrolled</span>}
            </div>

            {selected.finger_labels?.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2">
                {selected.finger_labels.map((f) => (
                  <span key={f} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[12px] font-medium text-[#0D1B39]">
                    <Fingerprint className="h-3.5 w-3.5 text-[#0A4FE8]" /> {formatFinger(f)}
                    <button onClick={() => removeFinger(selected.id, f)} className="ml-1 text-gray-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Finger</label>
                <select value={finger} onChange={(e) => { setFinger(e.target.value); setCaptured(null); }} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
                  {FINGER_LABELS.map((f) => <option key={f} value={f}>{formatFinger(f)}{selected.finger_labels?.includes(f) ? " (re-enroll)" : ""}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={capture} disabled={capturing} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#0A4FE8] bg-blue-50 px-4 py-2.5 text-sm font-semibold text-[#0A4FE8] transition hover:bg-blue-100 disabled:opacity-60">
                  {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                  {capturing ? "Place finger…" : "Capture fingerprint"}
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-gray-200 p-5">
              {captured ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50"><Fingerprint className="h-6 w-6 text-emerald-600" /></div>
                    <div>
                      <p className="text-sm font-semibold text-[#0D1B39]">Capture ready · {formatFinger(finger)}</p>
                      <p className="text-[12px] text-gray-500">Quality {captured.quality} · format {captured.format}</p>
                    </div>
                  </div>
                  <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-200 disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save enrollment
                  </button>
                </div>
              ) : (
                <p className="text-center text-sm text-gray-400">Capture a fingerprint to enable saving.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Booklet tab ─────────────── */

function BookletTab() {
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [report, setReport] = useState<BookletEntry[] | null>(null);
  const [workDays, setWorkDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/biometric?view=booklet&from=${from}&to=${to}`, { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not load booklet.");
      setReport(json.report);
      setWorkDays(json.work_days);
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not load booklet.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { run(); }, [run]);

  function exportCsv() {
    if (!report) return;
    const head = ["Member", "Role", "Department", "Work days", "Present", "On-time", "Late", "Absent", "Leave", "Avg hours", "Overtime (h)", "Attendance %", "Punctuality %", "Productivity", "Efficiency"];
    const rows = report.map((r) => [
      r.member.full_name, r.member.role_title || "", r.member.department || "",
      r.summary.work_days, r.summary.present_days, r.summary.on_time_days + r.summary.early_days,
      r.summary.late_days + r.summary.half_days, r.summary.absent_days, r.summary.leave_days,
      (r.summary.avg_work_minutes / 60).toFixed(1), (r.summary.total_overtime_minutes / 60).toFixed(1),
      r.summary.attendance_rate, r.summary.punctuality_rate, r.summary.avg_productivity, r.summary.efficiency_score,
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-booklet_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-white bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#0D1B39]"><TrendingUp className="h-5 w-5 text-[#0A4FE8]" /> Attendance Booklet</h2>
          <p className="text-sm text-gray-500">Performance &amp; efficiency over the selected range · {workDays} scheduled work days</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm" />
          </div>
          <button onClick={run} className="rounded-xl bg-[#0A4FE8] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-200">Apply</button>
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-[#0D1B39] hover:border-[#0A4FE8]"><Download className="h-4 w-4" /> CSV</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>
      ) : !report || report.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">No attendance data for this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3 font-semibold">Member</th>
                <th className="px-2 font-semibold">Present</th>
                <th className="px-2 font-semibold">On-time</th>
                <th className="px-2 font-semibold">Late</th>
                <th className="px-2 font-semibold">Absent</th>
                <th className="px-2 font-semibold">Avg hrs</th>
                <th className="px-2 font-semibold">OT</th>
                <th className="px-2 font-semibold">Attend.</th>
                <th className="px-2 font-semibold">Punct.</th>
                <th className="px-2 font-semibold">Efficiency</th>
                <th className="px-2" />
              </tr>
            </thead>
            <tbody>
              {report.map((r) => {
                const band = BAND_META[efficiencyBand(r.summary.efficiency_score)];
                const open = expanded === r.member.id;
                return (
                  <Fragment key={r.member.id}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-[#0D1B39]">{r.member.full_name}</p>
                        <p className="text-[11px] text-gray-400">{r.member.role_title || "Team"}</p>
                      </td>
                      <td className="px-2 text-gray-600">{r.summary.present_days}/{r.summary.work_days}</td>
                      <td className="px-2 text-emerald-600">{r.summary.on_time_days + r.summary.early_days}</td>
                      <td className="px-2 text-amber-600">{r.summary.late_days + r.summary.half_days}</td>
                      <td className="px-2 text-rose-600">{r.summary.absent_days}</td>
                      <td className="px-2 text-gray-600">{(r.summary.avg_work_minutes / 60).toFixed(1)}h</td>
                      <td className="px-2 text-gray-600">{(r.summary.total_overtime_minutes / 60).toFixed(1)}h</td>
                      <td className="px-2 text-gray-600">{r.summary.attendance_rate}%</td>
                      <td className="px-2 text-gray-600">{r.summary.punctuality_rate}%</td>
                      <td className="px-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${band.cls}`}>
                          {r.summary.efficiency_score} · {band.label}
                        </span>
                      </td>
                      <td className="px-2 text-right">
                        <button onClick={() => setExpanded(open ? null : r.member.id)} className="text-[12px] font-semibold text-[#0A4FE8]">{open ? "Hide" : "Days"}</button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-gray-50/40">
                        <td colSpan={11} className="px-3 py-3">
                          {r.days.length === 0 ? <p className="text-[12px] text-gray-400">No recorded days.</p> : (
                            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                              {r.days.map((d) => {
                                const meta = STATUS_META[d.attendance_status] || { label: d.attendance_status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
                                return (
                                  <div key={d.work_date} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-2.5 py-1.5">
                                    <span className="text-[12px] font-medium text-[#0D1B39]">{d.work_date}</span>
                                    <span className="flex items-center gap-2 text-[11px] text-gray-500">
                                      <Clock className="h-3 w-3" />{fmtTime(d.check_in_at)}–{fmtTime(d.check_out_at)}
                                      <span className={`rounded border px-1.5 py-0.5 font-semibold ${meta.cls}`}>{meta.label}</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Settings modal ─────────────── */

function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState(getBridgeUrl());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#0D1B39]">Scanner bridge</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-gray-500">Local address of the ZKTeco bridge agent running on this station&apos;s PC.</p>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:8787" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm" />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500">Cancel</button>
          <button onClick={() => { setBridgeUrl(url); onSaved(); onClose(); }} className="rounded-xl bg-[#0A4FE8] px-4 py-2 text-sm font-semibold text-white">Save &amp; reconnect</button>
        </div>
      </div>
    </div>
  );
}
