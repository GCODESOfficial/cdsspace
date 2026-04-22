"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Wallet,
  MessageSquare,
  Video,
  ArrowUpRight,
  Clock,
  TrendingUp,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

interface OverviewData {
  member: { full_name: string; role_title: string | null };
  stats: {
    assigned_work: number;
    next_payment: { amount: number; currency: string; scheduled_for: string | null } | null;
    unread_messages: number;
    upcoming_meetings: number;
    payroll_ytd: number;
  };
  recent_work: { id: number; title: string; category: string | null; cover_image: string | null }[];
  upcoming_meetings: { id: string; title: string; scheduled_for: string | null; room_code: string }[];
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

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Hero greeting */}
      <div
        className="relative rounded-3xl p-8 md:p-10 text-white overflow-hidden"
        style={{ backgroundImage: "linear-gradient(146.28deg, #0035C1 8.83%, #0575FF 86.3%)" }}
      >
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-semibold mb-2">
            {t("overview.welcome")}
          </p>
          <h1 className="text-[28px] md:text-[36px] font-bold tracking-tight">
            {member.full_name.split(" ")[0]} 👋
          </h1>
          {member.role_title && (
            <p className="text-white/80 mt-1 text-[14px]">{member.role_title}</p>
          )}
          <p className="text-white/80 mt-4 max-w-xl text-[14px] leading-relaxed">
            Here's what's on your plate today. Keep up the craft — the world is watching.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Briefcase}
          label={t("overview.assignedWork")}
          value={String(stats.assigned_work)}
          accent="bg-blue-50 text-brand-blue"
          href="/team/work"
        />
        <StatCard
          icon={Wallet}
          label={t("overview.nextPayment")}
          value={
            stats.next_payment
              ? `${currencySymbol(stats.next_payment.currency)}${formatNum(
                  stats.next_payment.amount
                )}`
              : "—"
          }
          subtext={stats.next_payment?.scheduled_for ? formatDate(stats.next_payment.scheduled_for) : "No scheduled payment"}
          accent="bg-emerald-50 text-emerald-600"
          href="/team/payroll"
        />
        <StatCard
          icon={MessageSquare}
          label={t("overview.unreadMessages")}
          value={String(stats.unread_messages)}
          accent="bg-purple-50 text-purple-600"
          href="/team/chat"
        />
        <StatCard
          icon={Video}
          label={t("overview.upcomingMeetings")}
          value={String(stats.upcoming_meetings)}
          accent="bg-amber-50 text-amber-600"
          href="/team/cmeet"
        />
      </div>

      {/* Two-col: recent work + upcoming meetings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-brand-stroke/30 overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-stroke/20 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-brand-navy">Your recent work</h2>
              <p className="text-[12px] text-brand-body/60">Projects you're assigned to</p>
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
              <p className="px-6 py-10 text-center text-brand-body/50 text-[13px]">
                You don't have any assigned work yet.
              </p>
            ) : (
              recent_work.map((w) => (
                <div key={w.id} className="px-6 py-4 flex items-center gap-4 hover:bg-brand-bg/40 transition">
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
                    href="/team/work"
                    className="text-[11px] text-brand-blue font-semibold hover:underline"
                  >
                    Open
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-brand-stroke/30 overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-stroke/20">
            <h2 className="text-[15px] font-bold text-brand-navy">Upcoming meetings</h2>
            <p className="text-[12px] text-brand-body/60">Next cMeet rooms</p>
          </div>
          <div className="divide-y divide-brand-stroke/20">
            {upcoming_meetings.length === 0 ? (
              <p className="px-6 py-10 text-center text-brand-body/50 text-[13px]">No meetings scheduled.</p>
            ) : (
              upcoming_meetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/team/cmeet`}
                  className="block px-6 py-4 hover:bg-brand-bg/40 transition"
                >
                  <p className="text-[13px] font-semibold text-brand-navy truncate">{m.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-brand-body/60">
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

      {/* Payroll YTD */}
      <div className="bg-white rounded-2xl border border-brand-stroke/30 p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <TrendingUp className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-brand-body/50">
            Paid to you this year
          </p>
          <p className="text-[20px] font-bold text-brand-navy tracking-tight">
            ₦{formatNum(stats.payroll_ytd)}
          </p>
        </div>
        <Link
          href="/team/payroll"
          className="px-4 py-2 rounded-xl bg-brand-navy text-white text-[12px] font-semibold hover:bg-brand-navy/90 transition"
        >
          View payroll
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  accent,
  href,
}: {
  icon: any;
  label: string;
  value: string;
  subtext?: string;
  accent: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-2xl border border-brand-stroke/30 p-5 hover:border-brand-blue/40 hover:shadow-[0_12px_28px_rgba(28,78,209,0.06)] transition"
    >
      <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center mb-4`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-brand-body/50 mb-1">
        {label}
      </p>
      <p className="text-[22px] font-bold text-brand-navy tracking-tight">{value}</p>
      {subtext && <p className="text-[11px] text-brand-body/60 mt-1 truncate">{subtext}</p>}
    </Link>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl h-48 bg-brand-stroke/30 animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-brand-stroke/30 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="h-80 bg-brand-stroke/30 rounded-2xl animate-pulse" />
    </div>
  );
}

function currencySymbol(c: string) {
  if (c === "NGN") return "₦";
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  if (c === "GBP") return "£";
  return c + " ";
}
function formatNum(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
