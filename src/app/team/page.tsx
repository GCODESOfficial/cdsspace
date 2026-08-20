"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  MessageSquare,
  Video,
  ArrowUpRight,
  Clock,
  CalendarCheck,
  LogIn,
  LogOut,
  ListPlus,
  FileText,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

interface OverviewData {
  member: { full_name: string; role_title: string | null };
  stats: {
    assigned_work: number;
    unread_messages: number;
    upcoming_meetings: number;
  };
  recent_work: { id: string; title: string; category: string | null; cover_image: string | null }[];
  upcoming_meetings: { id: string; title: string; scheduled_for: string | null; room_code: string }[];
  resume_completion?: number;
  attendance?: { clock_in_at: string | null; clock_out_at: string | null } | null;
}

export default function TeamOverviewPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/team/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <OverviewSkeleton />;
  if (!data) return null;

  const { member, stats, recent_work, upcoming_meetings } = data;
  const resumeCompletion = Math.max(0, Math.min(100, data.resume_completion ?? 0));

  return (
    <div className="space-y-4 max-w-[1400px]">
      {/* Hero greeting + primary actions */}
      <div
        className="relative overflow-hidden rounded-[28px] bg-[#0A4FE8] p-5 text-white sm:p-6 md:p-8"
      >
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-semibold mb-2">
              {t("overview.welcome")}
            </p>
            <h1 className="text-[28px] md:text-[36px] font-bold tracking-tight">
              {member.full_name.split(" ")[0]}
            </h1>
            {member.role_title && (
              // Role sits +4px above the supporting line below it.
              <p className="text-white/90 mt-1 text-[18px] font-medium">{member.role_title}</p>
            )}
            <p className="text-white/75 mt-3 max-w-xl text-[14px] leading-relaxed">
              Here&apos;s what&apos;s on your plate today. Keep up the craft - the world is watching.
            </p>
          </div>

          <HeroActions
            unread={stats.unread_messages}
            assigned={stats.assigned_work}
            attendance={data.attendance}
          />
        </div>
      </div>

      {/* Primary focus card - info only, not clickable */}
      <section className="bg-white rounded-2xl border border-brand-stroke/30 p-4 sm:p-5 md:p-6">
        <div className="mb-4">
          <h2 className="text-[15px] font-bold text-brand-navy">Today at a glance</h2>
          <p className="text-[12px] text-brand-body/60">A quick read on where things stand</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FocusStat icon={Briefcase} label={t("overview.assignedWork")} value={String(stats.assigned_work)} accent="bg-blue-50 text-brand-blue" />
          <FocusStat icon={MessageSquare} label={t("overview.unreadMessages")} value={String(stats.unread_messages)} accent="bg-purple-50 text-purple-600" />
          <FocusStat icon={Video} label={t("overview.upcomingMeetings")} value={String(stats.upcoming_meetings)} accent="bg-amber-50 text-amber-600" />
          <FocusResume percent={resumeCompletion} />
        </div>
      </section>

      {/* Two-col: recent work + upcoming meetings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-brand-stroke/30 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-brand-stroke/20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-brand-navy">Your recent work</h2>
              <p className="text-[12px] text-brand-body/60">Projects you&apos;re assigned to</p>
            </div>
            <Link
              href="/team/work"
              className="text-[12px] text-brand-blue font-semibold inline-flex items-center gap-1 hover:underline"
            >
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-brand-stroke/20">
            {recent_work.length === 0 ? (
              <p className="px-4 sm:px-6 py-10 text-center text-brand-body/50 text-[13px]">
                You don&apos;t have any assigned work yet.
              </p>
            ) : (
              recent_work.map((w) => (
                <div key={w.id} className="px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center hover:bg-brand-bg/40 transition">
                  <div className="w-12 h-12 rounded-xl bg-brand-bg border border-brand-stroke/30 overflow-hidden flex items-center justify-center shrink-0">
                    {w.cover_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.cover_image} alt={w.title} className="w-full h-full object-cover" />
                    ) : (
                      <Briefcase className="w-4 h-4 text-brand-body/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-brand-navy truncate">{w.title}</p>
                    {w.category && <p className="text-[11px] text-brand-body/60 mt-0.5">{w.category}</p>}
                  </div>
                  <Link
                    href={`/team/work?project=${w.id}`}
                    className="inline-flex w-full sm:w-auto justify-center rounded-xl border border-brand-blue/20 px-3 py-2 text-[11px] text-brand-blue font-semibold hover:bg-brand-blue/5"
                  >
                    Open
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-brand-stroke/30 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-brand-stroke/20">
            <h2 className="text-[15px] font-bold text-brand-navy">Upcoming meetings</h2>
            <p className="text-[12px] text-brand-body/60">Next cMeet rooms</p>
          </div>
          <div className="divide-y divide-brand-stroke/20">
            {upcoming_meetings.length === 0 ? (
              <p className="px-4 sm:px-6 py-10 text-center text-brand-body/50 text-[13px]">No meetings scheduled.</p>
            ) : (
              upcoming_meetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/team/cmeet`}
                  className="block px-4 sm:px-6 py-4 hover:bg-brand-bg/40 transition"
                >
                  <p className="text-[13px] font-semibold text-brand-navy truncate">{m.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-brand-body/60">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {m.scheduled_for ? formatDate(m.scheduled_for) : "No time set"}
                    </span>
                    <span className="font-mono">{m.room_code}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The three primary actions that sit at the top-right of the hero on desktop
 * and become a full-width, evenly-proportioned row on mobile.
 */
function HeroActions({
  unread,
  assigned,
  attendance,
}: {
  unread: number;
  assigned: number;
  attendance?: { clock_in_at: string | null; clock_out_at: string | null } | null;
}) {
  const attendanceActive = Boolean(attendance?.clock_in_at && !attendance?.clock_out_at);
  const attendanceRecorded = Boolean(attendance?.clock_out_at);
  const AttendanceIcon = attendanceActive ? LogOut : LogIn;
  const attendanceLabel = attendanceActive ? "Check out" : attendanceRecorded ? "Attendance" : "Check in";
  return (
    <div className="flex flex-wrap items-stretch gap-2 w-full md:w-auto md:flex-nowrap md:shrink-0">
      {/* Primary - full width on mobile (row 1), inline on desktop */}
      <Link
        href="/team/taskboard"
        className="basis-full md:basis-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0035C1] shadow-sm hover:bg-white/90 transition whitespace-nowrap"
      >
        <ListPlus className="w-4 h-4" />
        Assign task
      </Link>
      {/* Secondary - shares row 2 with the dropdown on mobile */}
      <Link
        href="/team/timebook"
        className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-[13px] font-semibold text-white ring-1 ring-inset ring-white/30 hover:bg-white/25 transition whitespace-nowrap"
      >
        <AttendanceIcon className="w-4 h-4" />
        {attendanceLabel}
      </Link>
      {/* Dropdown */}
      <MoreMenu unread={unread} assigned={assigned} className="shrink-0" />
    </div>
  );
}

function MoreMenu({ unread, assigned, className = "" }: { unread: number; assigned: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="w-full h-full inline-flex items-center justify-center gap-1 rounded-xl bg-white/15 px-3.5 py-2.5 text-[13px] font-semibold text-white ring-1 ring-inset ring-white/30 hover:bg-white/25 transition"
      >
        More
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 rounded-2xl border border-brand-stroke/30 bg-white p-1.5 shadow-[0_18px_44px_rgba(13,27,57,0.16)]"
        >
          <MenuLink icon={CalendarCheck} label="My Day" href="/team/my-day" accent="bg-blue-50 text-brand-blue" onSelect={() => setOpen(false)} />
          <MenuLink icon={MessageSquare} label="Unread messages" href="/team/chat" accent="bg-purple-50 text-purple-600" badge={unread} onSelect={() => setOpen(false)} />
          <MenuLink icon={Briefcase} label="Assigned work" href="/team/work" accent="bg-blue-50 text-brand-blue" badge={assigned} onSelect={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function MenuLink({
  icon: Icon,
  label,
  href,
  accent,
  badge,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
  accent: string;
  badge?: number;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium text-brand-navy hover:bg-brand-bg/60 transition"
    >
      <span className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center shrink-0`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand-blue text-white text-[11px] font-bold inline-flex items-center justify-center">
          {badge}
        </span>
      )}
    </Link>
  );
}

function FocusStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl bg-brand-bg/50 border border-brand-stroke/20 p-4">
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center shrink-0`}>
          <Icon className="w-4 h-4" />
        </span>
        <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-brand-body/50 leading-tight">
          {label}
        </p>
      </div>
      <p className="mt-3 text-[26px] font-bold text-brand-navy tracking-tight leading-none">{value}</p>
    </div>
  );
}

function FocusResume({ percent }: { percent: number }) {
  return (
    <div className="rounded-xl bg-brand-bg/50 border border-brand-stroke/20 p-4">
      <div className="flex items-center justify-between">
        <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4" />
        </span>
        <span className="text-[20px] font-bold text-brand-navy tracking-tight leading-none">{percent}%</span>
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-[0.12em] font-semibold text-brand-body/50">
        {percent >= 100 ? "Resume complete" : "Resume progress"}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-brand-stroke/30 overflow-hidden">
        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-[28px] h-44 bg-brand-stroke/30 animate-pulse" />
      <div className="rounded-2xl h-40 bg-brand-stroke/30 animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 h-80 bg-brand-stroke/30 rounded-2xl animate-pulse" />
        <div className="h-80 bg-brand-stroke/30 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}

function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
