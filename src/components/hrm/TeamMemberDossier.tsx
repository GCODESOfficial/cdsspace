"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeDollarSign,
  Banknote,
  BriefcaseBusiness,
  Cake,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Laptop,
  Loader2,
  LocateFixed,
  LogIn,
  Mail,
  MapPin,
  MessageSquareWarning,
  Phone,
  Plus,
  ShieldCheck,
  Smartphone,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { HR_RECORD_TYPE_LABELS, type HrRecordStatus, type HrRecordType } from "@/lib/hr-personnel";
import { initials } from "@/lib/utils";

type Payload = {
  capabilities: { financial: boolean; hr_records: boolean };
  member: Record<string, any>;
  birthday: { nextDate: string; daysUntil: number; year: number } | null;
  work_summary: { total_minutes: number; week_minutes: number; days_worked: number; week_days_worked: number; last_work_date?: string | null };
  access_summary: { login_count: number; unique_devices: number; active_sessions: number };
  attendance: Array<Record<string, any>>;
  login_sessions: Array<Record<string, any>>;
  groups: Array<Record<string, any>>;
  leave: Array<Record<string, any>>;
  face_profile: Record<string, any> | null;
  equipment: Array<Record<string, any>>;
  financial: null | { profile: Record<string, any> | null; payroll_history: Array<Record<string, any>>; total_paid: number };
  hr_records: Array<Record<string, any>>;
  queries: Array<Record<string, any>>;
};

type Tab = "overview" | "attendance" | "access" | "financial" | "records";

function hours(minutes: unknown) {
  const total = Math.max(0, Number(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

function date(value: unknown, withTime = false) {
  if (!value) return "Not available";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return withTime ? parsed.toLocaleString() : parsed.toLocaleDateString();
}

function money(value: unknown, currency = "NGN") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN", maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function TeamMemberDossier({ memberId }: { memberId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [birthdayEditing, setBirthdayEditing] = useState(false);
  const [birthdaySaving, setBirthdaySaving] = useState(false);
  const [birthdayForm, setBirthdayForm] = useState({ date_of_birth: "", birthday_reminder_enabled: true, birthday_reminder_days: 14 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/team-members/${encodeURIComponent(memberId)}/profile`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load this team member.");
      setPayload(data);
      setBirthdayForm({
        date_of_birth: String(data.member.date_of_birth || "").slice(0, 10),
        birthday_reminder_enabled: data.member.birthday_reminder_enabled !== false,
        birthday_reminder_days: Number(data.member.birthday_reminder_days || 14),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load this team member.");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { void load(); }, [load]);

  const member = payload?.member;
  const openQueries = useMemo(() => payload?.queries.filter((query) => !["resolved", "archived"].includes(String(query.status))).length || 0, [payload]);

  async function saveBirthday(event: React.FormEvent) {
    event.preventDefault();
    setBirthdaySaving(true);
    try {
      const response = await fetch(`/api/admin/team-members/${encodeURIComponent(memberId)}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(birthdayForm),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not save the birthday reminder.");
      toast.success("Birthday reminder updated.");
      setBirthdayEditing(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the birthday reminder.");
    } finally {
      setBirthdaySaving(false);
    }
  }

  if (loading) return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></div>;
  if (!payload || !member) return <div className="p-8"><Link href="/admin/team-members" className="text-sm font-semibold text-[#0A4FE8]">Return to team members</Link></div>;

  const tabItems: Array<{ id: Tab; label: string; icon: typeof Users; count?: number }> = [
    { id: "overview", label: "Overview", icon: Users },
    { id: "attendance", label: "Attendance", icon: Clock3, count: payload.attendance.length },
    { id: "access", label: "Access and devices", icon: ShieldCheck, count: payload.login_sessions.length },
    { id: "financial", label: "Financial", icon: WalletCards, count: payload.financial?.payroll_history.length },
    { id: "records", label: "HR records", icon: FileCheck2, count: payload.hr_records.length },
  ];

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/team-members" className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-500 hover:text-[#0A4FE8]"><ArrowLeft className="h-4 w-4" /> Team members</Link>
        {payload.capabilities.hr_records && <Link href={`/admin/hrm/compliance?member_id=${member.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-semibold text-white"><Plus className="h-4 w-4" /> Add HR record</Link>}
      </div>

      <header className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="h-2 bg-[#0A4FE8]" />
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:p-7">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[#0A4FE8] text-xl font-bold text-white ring-4 ring-blue-50">
            {member.avatar_url ? <img src={member.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(member.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] font-semibold text-[#0D1B39]">{member.full_name}</h1>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${member.is_active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{member.is_active ? "Active" : "Suspended"}</span>
              {member.is_sub_admin && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-[#0A4FE8]">Sub-admin</span>}
            </div>
            <p className="mt-1 text-[13px] text-slate-500">{member.role_title || "Team member"}{member.department ? ` · ${member.department}` : ""}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11.5px] text-slate-500"><span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{member.email}</span>{member.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{member.phone}</span>}{member.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{member.location}</span>}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:w-auto">
            <MiniStat label="Total work" value={hours(payload.work_summary.total_minutes)} />
            <MiniStat label="This week" value={hours(payload.work_summary.week_minutes)} />
            <MiniStat label="Groups" value={String(payload.groups.length)} />
            <MiniStat label="Open queries" value={String(openQueries)} tone={openQueries ? "warning" : "default"} />
          </div>
        </div>
      </header>

      <nav className="flex snap-x gap-2 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Team member record sections">
        {tabItems.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex h-10 shrink-0 snap-start items-center gap-2 rounded-xl px-3 text-[11.5px] font-semibold ${tab === item.id ? "bg-[#0A4FE8] text-white" : "text-slate-500 hover:bg-slate-50"}`}><item.icon className="h-4 w-4" />{item.label}{item.count != null && <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${tab === item.id ? "bg-white/20" : "bg-slate-100"}`}>{item.count}</span>}</button>)}
      </nav>

      {tab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <section className="space-y-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <SectionTitle icon={BriefcaseBusiness} title="Employment profile" />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Detail label="Username" value={`@${member.username}`} />
              <Detail label="Joined" value={date(member.joined_at)} />
              <Detail label="Work mode" value={String(member.work_mode || "Not set").replaceAll("_", " ")} />
              <Detail label="Days worked" value={String(payload.work_summary.days_worked)} />
              <Detail label="Week days worked" value={String(payload.work_summary.week_days_worked)} />
              <Detail label="Last work date" value={date(payload.work_summary.last_work_date)} />
              <Detail label="Account created" value={date(member.created_at, true)} />
              <Detail label="Profile updated" value={date(member.updated_at, true)} />
            </div>
            {member.bio && <div className="rounded-xl bg-slate-50 p-4 text-[12px] leading-5 text-slate-600">{member.bio}</div>}

            <SectionTitle icon={Users} title={`Groups and project rooms (${payload.groups.length})`} />
            <div className="grid gap-2 sm:grid-cols-2">
              {payload.groups.length ? payload.groups.map((group) => <div key={group.id} className="rounded-xl border border-slate-100 p-3"><p className="text-[12px] font-semibold text-[#0D1B39]">{group.name || group.department || "Team group"}</p><p className="mt-0.5 text-[10.5px] text-slate-400">{String(group.kind || "group").replaceAll("_", " ")} · {group.role || "Member"}</p></div>) : <Empty text="No active groups." />}
            </div>

            <SectionTitle icon={CalendarDays} title={`Leave history (${payload.leave.length})`} />
            <div className="space-y-2">
              {payload.leave.length ? payload.leave.slice(0, 10).map((leave) => <div key={leave.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3"><div><p className="text-[12px] font-semibold text-[#0D1B39]">{String(leave.leave_type).replaceAll("_", " ")}</p><p className="text-[10.5px] text-slate-500">{date(leave.start_date)} to {date(leave.end_date)}</p></div><RecordStatus status={leave.status} /></div>) : <Empty text="No leave records." />}
            </div>

            <SectionTitle icon={Laptop} title={`Assigned equipment (${payload.equipment.length})`} />
            <div className="grid gap-2 sm:grid-cols-2">
              {payload.equipment.length ? payload.equipment.map((item) => <div key={item.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[12px] font-semibold text-[#0D1B39]">{item.name}</p><RecordStatus status={item.condition} /></div><p className="mt-1 text-[10.5px] text-slate-500">{item.equipment_type} · {item.asset_tag}</p><p className="mt-1 text-[10px] text-slate-400">Assigned {date(item.assigned_at)}</p></div>) : <Empty text="No company equipment is currently assigned." />}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><SectionTitle icon={Cake} title="Birthday reminder" compact /><button type="button" onClick={() => setBirthdayEditing((value) => !value)} className="text-[11px] font-semibold text-[#0A4FE8]">{birthdayEditing ? "Close" : "Edit"}</button></div>
              {birthdayEditing ? (
                <form onSubmit={saveBirthday} className="mt-4 space-y-3"><label className="block text-[11px] font-semibold text-slate-600">Birthday<input type="date" value={birthdayForm.date_of_birth} onChange={(event) => setBirthdayForm((value) => ({ ...value, date_of_birth: event.target.value }))} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-[12px]" /></label><label className="flex items-center gap-2 text-[11.5px] text-slate-600"><input type="checkbox" checked={birthdayForm.birthday_reminder_enabled} onChange={(event) => setBirthdayForm((value) => ({ ...value, birthday_reminder_enabled: event.target.checked }))} /> Enable celebration reminder</label><label className="block text-[11px] font-semibold text-slate-600">Remind us before<input type="number" min={1} max={90} value={birthdayForm.birthday_reminder_days} onChange={(event) => setBirthdayForm((value) => ({ ...value, birthday_reminder_days: Number(event.target.value) }))} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-[12px]" /></label><button type="submit" disabled={birthdaySaving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-semibold text-white">{birthdaySaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save reminder</button></form>
              ) : member.date_of_birth ? <div className="mt-4"><p className="text-2xl font-semibold text-[#0D1B39]">{new Date(`${String(member.date_of_birth).slice(0,10)}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long" })}</p><p className="mt-1 text-[11px] text-slate-500">{payload.birthday?.daysUntil === 0 ? "Birthday is today" : `${payload.birthday?.daysUntil} days until the next birthday`} · Reminder {member.birthday_reminder_days} days before</p></div> : <Empty text="Birthday has not been added." />}
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><SectionTitle icon={LogIn} title="Access summary" compact /><div className="mt-4 grid grid-cols-3 gap-2"><MiniStat label="Logins" value={String(payload.access_summary.login_count)} /><MiniStat label="Devices" value={String(payload.access_summary.unique_devices)} /><MiniStat label="Active" value={String(payload.access_summary.active_sessions)} /></div></section>

            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><SectionTitle icon={MessageSquareWarning} title="Queries" compact /><div className="mt-4 space-y-2">{payload.queries.length ? payload.queries.slice(0, 6).map((query) => <div key={query.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-[12px] font-semibold text-[#0D1B39]">{query.title}</p><RecordStatus status={query.status} /></div><p className="mt-1 line-clamp-2 text-[10.5px] leading-4 text-slate-500">{query.summary || "No additional details."}</p></div>) : <Empty text="No queries on record." />}</div></section>
          </aside>
        </div>
      )}

      {tab === "attendance" && <AttendancePanel rows={payload.attendance} />}
      {tab === "access" && <AccessPanel sessions={payload.login_sessions} summary={payload.access_summary} faceProfile={payload.face_profile} />}
      {tab === "financial" && <FinancialPanel data={payload.financial} member={member} allowed={payload.capabilities.financial} />}
      {tab === "records" && <RecordsPanel records={payload.hr_records} allowed={payload.capabilities.hr_records} />}
    </main>
  );
}

function AttendancePanel({ rows }: { rows: Array<Record<string, any>> }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="p-5"><SectionTitle icon={Clock3} title="Attendance and working hours" /></div><div className="overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-slate-50 text-[10px] font-semibold text-slate-500"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Attendance</th><th className="px-5 py-3">Clock in</th><th className="px-5 py-3">Clock out</th><th className="px-5 py-3">Hours</th><th className="px-5 py-3">Location check</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.length ? rows.map((row) => <tr key={row.work_date} className="text-[11.5px] text-slate-600"><td className="whitespace-nowrap px-5 py-3 font-semibold text-[#0D1B39]">{date(row.work_date)}</td><td className="px-5 py-3"><RecordStatus status={row.attendance_status} /></td><td className="whitespace-nowrap px-5 py-3">{date(row.clock_in_at, true)}</td><td className="whitespace-nowrap px-5 py-3">{date(row.clock_out_at, true)}</td><td className="whitespace-nowrap px-5 py-3 font-semibold">{hours(row.total_work_minutes)}</td><td className="px-5 py-3">{row.clock_in_inside_geofence == null ? "Not captured" : row.clock_in_inside_geofence ? "Inside geofence" : "Outside geofence"}</td></tr>) : <tr><td colSpan={6}><Empty text="No attendance records." /></td></tr>}</tbody></table></div></section>;
}

function AccessPanel({ sessions, summary, faceProfile }: { sessions: Array<Record<string, any>>; summary: Payload["access_summary"]; faceProfile: Record<string, any> | null }) {
  return <section className="space-y-4"><div className="grid grid-cols-3 gap-3"><Stat icon={LogIn} label="Recorded logins" value={summary.login_count} /><Stat icon={Laptop} label="Unique devices" value={summary.unique_devices} /><Stat icon={ShieldCheck} label="Active sessions" value={summary.active_sessions} /></div><div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><SectionTitle icon={ShieldCheck} title="Face verification" /><div className="mt-4 grid gap-3 sm:grid-cols-4"><Detail label="Status" value={faceProfile?.status} /><Detail label="Last verified" value={date(faceProfile?.last_verified_at, true)} /><Detail label="Match score" value={faceProfile?.latest_match_score == null ? "Not available" : Number(faceProfile.latest_match_score).toFixed(3)} /><Detail label="Failed attempts" value={faceProfile?.verification_failures ?? 0} /></div>{faceProfile?.latest_verification_flag && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-700">Latest flag: {String(faceProfile.latest_verification_flag).replaceAll("_", " ")}</p>}</div><div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><SectionTitle icon={LocateFixed} title="Login, device, and location history" /><div className="mt-4 space-y-3">{sessions.length ? sessions.map((session) => <article key={session.id} className="grid gap-3 rounded-2xl border border-slate-100 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]">{session.device_type === "mobile" ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-[12px] font-semibold text-[#0D1B39]">{session.device_name || [session.browser_name, session.os_name].filter(Boolean).join(" on ") || session.device_type}</p><span className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${session.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{session.active ? "Active" : session.revoke_reason || "Ended"}</span></div><p className="mt-1 text-[10.5px] text-slate-500">{[session.city, session.region, session.country].filter(Boolean).join(", ") || "Location not available"}{session.ip_address ? ` · IP ${session.ip_address}` : ""}</p><p className="mt-1 text-[10px] text-slate-400">{session.login_source || "Team login"} · {session.timezone || "Timezone unavailable"}</p></div><div className="text-left md:text-right"><p className="text-[10px] text-slate-400">Logged in</p><p className="text-[11px] font-semibold text-slate-600">{date(session.created_at, true)}</p><p className="mt-1 text-[10px] text-slate-400">Last seen {date(session.last_seen_at, true)}</p></div></article>) : <Empty text="No login sessions have been recorded." />}</div></div></section>;
}

function FinancialPanel({ data, member, allowed }: { data: Payload["financial"]; member: Record<string, any>; allowed: boolean }) {
  if (!allowed) return <Restricted text="Financial records require the HR financial or payroll permission." />;
  const profile = data?.profile || member;
  const currency = String(profile.currency || member.salary_currency || "NGN");
  return <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><aside className="space-y-5"><section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><SectionTitle icon={Banknote} title="Bank details" compact /><div className="mt-4 space-y-3"><Detail label="Bank" value={profile.bank_name || member.bank_name} /><Detail label="Account name" value={profile.account_name || member.account_name} /><Detail label="Account number" value={profile.account_number || member.account_number} /><Detail label="Bank code" value={profile.bank_code || member.bank_code} /></div></section><section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><SectionTitle icon={BadgeDollarSign} title="Compensation" compact /><p className="mt-4 text-2xl font-semibold text-[#0D1B39]">{money(profile.base_salary || member.base_salary, currency)}</p><p className="text-[11px] text-slate-500">{member.pay_cycle || "Monthly"} base salary</p><div className="mt-4 rounded-xl bg-blue-50 p-3"><p className="text-[10px] text-[#0A4FE8]">Paid since inception</p><p className="mt-1 text-lg font-semibold text-[#0D1B39]">{money(data?.total_paid, currency)}</p></div></section></aside><section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="p-5"><SectionTitle icon={WalletCards} title="Salary and payment history" /></div><div className="divide-y divide-slate-100">{data?.payroll_history.length ? data.payroll_history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4 md:px-5"><div><p className="text-[12px] font-semibold text-[#0D1B39]">{item.title || `Payroll ${item.period}`}</p><p className="mt-0.5 text-[10.5px] text-slate-500">{item.period} · {item.narration || "Salary payment"}</p></div><div className="text-right"><p className="text-[13px] font-semibold text-[#0D1B39]">{money(item.amount, item.currency || currency)}</p><RecordStatus status={item.status} /></div></div>) : <Empty text="No payroll history is linked to this team member." />}</div></section></div>;
}

function RecordsPanel({ records, allowed }: { records: Array<Record<string, any>>; allowed: boolean }) {
  if (!allowed) return <Restricted text="HR personnel records require HR Compliance permission." />;
  return <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><SectionTitle icon={FileCheck2} title="Personnel documents and actions" /><div className="mt-4 grid gap-3 md:grid-cols-2">{records.length ? records.map((record) => <article key={record.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-blue-50 px-2 py-1 text-[9.5px] font-semibold text-[#0A4FE8]">{HR_RECORD_TYPE_LABELS[record.record_type as HrRecordType] || record.record_type}</span><RecordStatus status={record.status as HrRecordStatus} /></div><h3 className="mt-3 text-[13px] font-semibold text-[#0D1B39]">{record.title}</h3><p className="mt-1 line-clamp-3 text-[11px] leading-5 text-slate-500">{record.summary || "No additional details."}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="text-[10px] text-slate-400">{record.record_number} · {date(record.event_date)}</span>{record.file_url && <a href={record.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#0A4FE8]"><FileText className="h-3.5 w-3.5" /> Open</a>}</div></article>) : <Empty text="No HR records have been added." />}</div></section>;
}

function SectionTitle({ icon: Icon, title, compact = false }: { icon: typeof Users; title: string; compact?: boolean }) { return <div className="flex items-center gap-2"><span className={`grid place-items-center rounded-xl bg-blue-50 text-[#0A4FE8] ${compact ? "h-8 w-8" : "h-9 w-9"}`}><Icon className="h-4 w-4" /></span><h2 className="text-[14px] font-semibold text-[#0D1B39]">{title}</h2></div>; }
function Detail({ label, value }: { label: string; value: unknown }) { return <div><p className="text-[10px] font-semibold text-slate-400">{label}</p><p className="mt-1 break-words text-[12px] font-medium capitalize text-[#0D1B39]">{String(value || "Not available")}</p></div>; }
function MiniStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) { return <div className={`min-w-[92px] rounded-xl border p-3 ${tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-[13px] font-semibold text-[#0D1B39]">{value}</p></div>; }
function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) { return <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><Icon className="h-5 w-5 text-[#0A4FE8]" /><p className="mt-3 text-xl font-semibold text-[#0D1B39]">{value}</p><p className="text-[10.5px] text-slate-500">{label}</p></div>; }
function RecordStatus({ status }: { status: unknown }) { const value = String(status || "unknown").replaceAll("_", " "); const good = ["paid", "resolved", "approved", "acknowledged", "on time", "early"].includes(value); const warning = ["pending", "issued", "late", "half day"].includes(value); return <span className={`inline-flex rounded-full px-2 py-0.5 text-[9.5px] font-semibold capitalize ${good ? "bg-emerald-50 text-emerald-700" : warning ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{value}</span>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-slate-50 p-4 text-[11.5px] text-slate-400">{text}</p>; }
function Restricted({ text }: { text: string }) { return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-[13px] text-amber-800"><ShieldCheck className="mb-3 h-6 w-6" />{text}</div>; }
