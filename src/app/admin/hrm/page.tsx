"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { hasPermission } from "@/lib/admin-permissions";
import {
  ShieldCheck, Users, Briefcase, Award, ArrowUpRight, Loader2,
  Clock, Activity, Building2, KanbanSquare,
  GraduationCap, BadgeDollarSign, BarChart3, KeyRound, CalendarClock,
  UserPlus, X, Copy, Check, Plane,
} from "lucide-react";
import { toast } from "sonner";

interface Stats {
  subAdmins: number;
  applications: number;
  openRoles: number;
  certRequests: number;
  pendingCerts: number;
}

type Session = { role: "super_admin" | "sub_admin"; permissions: string[] } | null;

type LeaveRequest = {
  id: string;
  team_member_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  team_members?: { full_name?: string; department?: string | null } | null;
};

type Member = { id: string; full_name: string; department?: string | null };

// Every HRM sub-module. `perm` is checked client-side to hide cards a
// sub-admin can't open (super admins see all); the target pages guard too.
const MODULES = [
  { href: "/admin/team-members", label: "Team Members", desc: "Roster, profiles & invites", icon: Users, tint: "bg-[#0A4FE8]", perm: "team_members" },
  { href: "/admin/taskboard", label: "Taskboard", desc: "Shared lists, tasks, people & documents", icon: KanbanSquare, tint: "bg-[#0A4FE8]", perm: "team_today" },
  { href: "/admin/timebook", label: "Attendance", desc: "Check-ins, schedules, leave & geofence", icon: Clock, tint: "from-teal-500 to-emerald-500", perm: "timebook" },
  { href: "/admin/work-tracking", label: "Work Activity", desc: "Live focus, task context & evidence", icon: Activity, tint: "from-amber-500 to-orange-500", perm: "work_tracking" },
  { href: "/admin/team-reports", label: "Team Reports", desc: "Reported vs tracked (super admin)", icon: BarChart3, tint: "from-orange-500 to-red-500", superAdminOnly: true },
  { href: "/admin/team-payroll", label: "Team Payroll", desc: "Salaries & payroll runs", icon: BadgeDollarSign, tint: "from-lime-500 to-green-500", perm: "team_payroll" },
  { href: "/admin/departments", label: "Departments", desc: "Teams & department leads", icon: Building2, tint: "from-violet-500 to-purple-500", perm: "departments" },
  { href: "/admin/sub-admins", label: "Sub-admins", desc: "Admin team & permissions", icon: ShieldCheck, tint: "bg-[#0A4FE8]", perm: "sub_admins" },
  { href: "/admin/applications", label: "Applications", desc: "Review applicants & assign roles", icon: Users, tint: "from-fuchsia-500 to-pink-500", perm: "applicants" },
  { href: "/admin/screening", label: "Screening", desc: "Interviews & candidate screening", icon: GraduationCap, tint: "from-pink-500 to-rose-500", perm: "applicants" },
  { href: "/admin/hrm/roles", label: "Open Roles", desc: "Post & manage job openings", icon: Briefcase, tint: "from-amber-500 to-yellow-500", perm: "applicants" },
  { href: "/admin/hrm/certifications", label: "Certifications", desc: "Issue internship certificates", icon: Award, tint: "from-purple-500 to-violet-500", perm: "applicants" },
];

export default function HRMOverview() {
  const [session, setSession] = useState<Session>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<null | "bypass" | "leave">(null);

  const can = useCallback((perm?: string, superAdminOnly?: boolean) => {
    if (!session) return false;
    if (session.role === "super_admin") return true;
    if (superAdminOnly) return false;
    return perm ? hasPermission(session.permissions, perm) : true;
  }, [session]);

  const loadLeave = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/timebook");
      if (!r.ok) return;
      const j = await r.json();
      setLeaveRequests((j.leave_requests || []).filter((l: LeaveRequest) => l.status === "pending"));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const sess = await fetch("/api/admin-check").then((r) => r.ok ? r.json() : null).catch(() => null);
        if (sess?.authenticated) setSession({ role: sess.role, permissions: sess.permissions || [] });

        const [subAdminsRes, appsRes, rolesRes, certsRes] = await Promise.all([
          supabase.from("sub_admins").select("id"),
          supabase.from("applications").select("id"),
          supabase.from("open_roles").select("id, is_active"),
          supabase.from("cert_requests").select("id, status"),
        ]);
        const certs = certsRes.data || [];
        setStats({
          subAdmins: subAdminsRes.data?.length || 0,
          applications: appsRes.data?.length || 0,
          openRoles: (rolesRes.data || []).filter((r: { is_active?: boolean }) => r.is_active).length,
          certRequests: certs.length,
          pendingCerts: certs.filter((c: { status?: string }) => c.status === "pending").length,
        });

        fetch("/api/admin/team-members").then((r) => r.ok ? r.json() : null).then((j) => {
          if (j?.members) setMembers(j.members);
        }).catch(() => {});
        await loadLeave();
      } catch (e) { console.error(e); }
      setIsLoading(false);
    }
    load();
  }, [loadLeave]);

  const visibleModules = useMemo(
    () => MODULES.filter((m) => can(m.perm, m.superAdminOnly)),
    [can],
  );

  const canBypass = can("timebook.manage_bypass");
  const canLeave = can("timebook") || can("team_members");

  const quickActions = [
    canBypass && { key: "bypass", label: "Generate bypass code", desc: "Geofence override for check-in", icon: KeyRound, onClick: () => setModal("bypass") },
    canLeave && { key: "leave", label: "Review leave requests", desc: leaveRequests.length ? `${leaveRequests.length} pending` : "Approve or reject leave", icon: Plane, badge: leaveRequests.length, onClick: () => setModal("leave") },
    can("team_members") && { key: "add-member", label: "Add team member", desc: "Invite someone to the team", icon: UserPlus, href: "/admin/team-members" },
    can("team_today") && { key: "assign-task", label: "Open Taskboard", desc: "Create and assign shared work", icon: KanbanSquare, href: "/admin/taskboard" },
    can("timebook") && { key: "set-office", label: "Set office geofence", desc: "Update location & radius", icon: CalendarClock, href: "/admin/timebook" },
  ].filter(Boolean) as { key: string; label: string; desc: string; icon: typeof KeyRound; badge?: number; onClick?: () => void; href?: string }[];

  return (
    <div className="p-8 max-w-[1280px]">
      <div className="mb-8">
        <p className="text-[#0A4FE8] text-sm font-semibold">Operations</p>
        <h1 className="text-[28px] font-bold text-[#0D1B39] tracking-tight">HRM</h1>
        <p className="text-gray-400 text-[13px] mt-1">Human resource management - team, attendance, roles, applications & certifications</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
              <Stat icon={<ShieldCheck className="w-5 h-5 text-[#0A4FE8]" />} label="Sub-admins" value={stats.subAdmins} bg="bg-blue-50" />
              <Stat icon={<Users className="w-5 h-5 text-emerald-600" />} label="Applications" value={stats.applications} bg="bg-emerald-50" />
              <Stat icon={<Briefcase className="w-5 h-5 text-amber-600" />} label="Active Roles" value={stats.openRoles} bg="bg-amber-50" />
              <Stat icon={<Plane className="w-5 h-5 text-rose-600" />} label="Pending Leave" value={leaveRequests.length} subtitle={leaveRequests.length ? "needs review" : "all clear"} bg="bg-rose-50" />
            </div>
          )}

          {/* Quick actions */}
          {quickActions.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
                {quickActions.map((a) => {
                  const inner = (
                    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all text-left">
                      {a.badge ? (
                        <span className="absolute right-3 top-3 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold grid place-items-center">{a.badge}</span>
                      ) : null}
                      <div className="w-10 h-10 rounded-xl bg-[#0A4FE8]/10 grid place-items-center mb-3">
                        <a.icon className="w-5 h-5 text-[#0A4FE8]" />
                      </div>
                      <h3 className="font-semibold text-[#0D1B39] text-[14px] leading-tight">{a.label}</h3>
                      <p className="text-[11.5px] text-gray-500 mt-1">{a.desc}</p>
                    </div>
                  );
                  return a.href ? (
                    <Link key={a.key} href={a.href}>{inner}</Link>
                  ) : (
                    <button key={a.key} type="button" onClick={a.onClick} className="text-left">{inner}</button>
                  );
                })}
              </div>
            </>
          )}

          {/* Modules */}
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Modules</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
            {visibleModules.map((s) => (
              <Link key={s.href} href={s.href} className="group">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all">
                  <div className="flex items-start justify-between mb-5">
                    <div className={`w-12 h-12 rounded-xl bg-[#0A4FE8] grid place-items-center shadow-lg shadow-blue-600/10`}>
                      <s.icon className="w-6 h-6 text-white" />
                    </div>
                    <ArrowUpRight className="w-5 h-5 text-gray-300 group-hover:text-[#0A4FE8] transition" />
                  </div>
                  <h3 className="font-semibold text-[#0D1B39]">{s.label}</h3>
                  <p className="text-xs text-gray-500 mt-1">{s.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {modal === "bypass" && <BypassModal members={members} onClose={() => setModal(null)} />}
      {modal === "leave" && (
        <LeaveModal
          leaveRequests={leaveRequests}
          onClose={() => setModal(null)}
          onReviewed={loadLeave}
        />
      )}
    </div>
  );
}

function Stat({ icon, label, value, subtitle, bg }: { icon: React.ReactNode; label: string; value: number; subtitle?: string; bg: string }) {
  return (
    <div className={`${bg} rounded-2xl p-5`}>
      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-4 shadow-sm">{icon}</div>
      <p className="text-[28px] font-bold text-[#0D1B39] leading-none">{value}</p>
      <p className="text-[13px] text-gray-500 mt-1.5 font-medium">{label}</p>
      {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

const EXPIRY_OPTIONS = [
  { label: "30 minutes", minutes: 30 },
  { label: "2 hours", minutes: 120 },
  { label: "Today (12h)", minutes: 720 },
  { label: "3 days", minutes: 3 * 24 * 60 },
  { label: "7 days", minutes: 7 * 24 * 60 },
];

function BypassModal({ members, onClose }: { members: Member[]; onClose: () => void }) {
  const [memberId, setMemberId] = useState("");
  const [reason, setReason] = useState("GPS/geofence exception approved by admin");
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/timebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_bypass_code", member_id: memberId || null, reason, expires_minutes: minutes }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to generate");
      setCode(j.code);
      toast.success("Bypass code generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  return (
    <Modal title="Generate bypass code" onClose={onClose}>
      {code ? (
        <div className="text-center">
          <p className="text-[13px] text-gray-500">Share this one-time code with the team member. It won&apos;t be shown again.</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <code className="rounded-xl bg-gray-900 px-5 py-3 text-xl font-bold tracking-widest text-white">{code}</code>
            <button type="button" onClick={copy} className="rounded-xl border border-gray-200 p-3 hover:bg-gray-50">
              {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5 text-gray-500" />}
            </button>
          </div>
          <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl bg-[#0A4FE8] py-3 text-sm font-semibold text-white">Done</button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="For">
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm">
              <option value="">Any team member</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </Field>
          <Field label="Reason">
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" />
          </Field>
          <Field label="Expires in">
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm">
              {EXPIRY_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
            </select>
          </Field>
          <button type="button" disabled={busy} onClick={generate} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] py-3 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Generate code
          </button>
        </div>
      )}
    </Modal>
  );
}

function LeaveModal({ leaveRequests, onClose, onReviewed }: { leaveRequests: LeaveRequest[]; onClose: () => void; onReviewed: () => void }) {
  const [items, setItems] = useState(leaveRequests);
  const [busyId, setBusyId] = useState<string>("");

  const review = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    try {
      const r = await fetch("/api/admin/timebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review_leave", leave_id: id, status }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed");
      setItems((prev) => prev.filter((l) => l.id !== id));
      toast.success(`Leave ${status}`);
      onReviewed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId("");
    }
  };

  return (
    <Modal title="Leave requests" onClose={onClose}>
      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">No pending leave requests.</div>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {items.map((l) => (
            <div key={l.id} className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#0D1B39] text-[14px]">{l.team_members?.full_name || "Team member"}</p>
                  <p className="text-[12px] text-gray-500 capitalize">{l.leave_type} leave · {l.start_date} → {l.end_date}</p>
                  {l.reason && <p className="mt-1 text-[12.5px] text-gray-600">{l.reason}</p>}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={!!busyId} onClick={() => review(l.id, "approved")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
                  {busyId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                </button>
                <button type="button" disabled={!!busyId} onClick={() => review(l.id, "rejected")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-[13px] font-semibold text-gray-700 disabled:opacity-60">
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#0D1B39]">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  );
}
