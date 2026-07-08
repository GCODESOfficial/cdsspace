"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PenLine, Clapperboard, Sparkles, ClipboardCheck, CalendarClock, FileEdit, CheckCircle2, Send, Archive } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import ActivityPanel from "@/components/admin/ActivityPanel";
import { StatusBadge } from "@/components/content-hub/parts";
import { platformLabel, type ContentStatus } from "@/lib/content-hub/shared";

interface Upcoming { id: string; title: string; scheduled_at: string; scheduled_platform: string | null; status: ContentStatus; assigned_publisher_name: string | null; platforms: string[] }

export default function ContentHubDashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/content-hub/meta", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) { setCounts(d.stats?.counts || {}); setUpcoming(d.stats?.upcoming || []); } })
      .finally(() => setLoading(false));
  }, []);

  return (
    <ContentHubShell
      title="Content Hub"
      subtitle="Plan, create, approve, schedule and package content - then hand it to the Social Media Manager to post."
      action={
        <Link href="/admin/content-hub/create" className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#083EC0]">
          <PenLine className="h-4 w-4" /> Create Content
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={FileEdit} color="gray" label="Drafts" value={counts.draft || 0} />
        <Stat icon={Send} color="amber" label="Pending" value={counts.pending || 0} />
        <Stat icon={CheckCircle2} color="blue" label="Approved" value={counts.approved || 0} />
        <Stat icon={CalendarClock} color="violet" label="Scheduled" value={counts.scheduled || 0} />
        <Stat icon={CheckCircle2} color="emerald" label="Published" value={counts.published || 0} />
        <Stat icon={Archive} color="slate" label="Archived" value={counts.archived || 0} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Upcoming */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-[#0D1B39]">Upcoming schedule</h2>
            <Link href="/admin/content-hub/calendar" className="text-[12px] font-semibold text-[#0A4FE8] hover:underline">Open calendar</Link>
          </div>
          {loading ? (
            <p className="py-8 text-center text-[13px] text-gray-400">Loading...</p>
          ) : upcoming.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-gray-400">Nothing scheduled yet. Create content and schedule it.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {upcoming.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-blue-50 text-[#0A4FE8]">
                    <span className="text-[10px] font-bold uppercase">{new Date(u.scheduled_at).toLocaleDateString(undefined, { month: "short" })}</span>
                    <span className="text-[15px] font-bold leading-none">{new Date(u.scheduled_at).getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/content-hub/library?id=${u.id}`} className="block truncate text-[13.5px] font-bold text-[#0D1B39] hover:text-[#0A4FE8]">{u.title}</Link>
                    <p className="text-[11.5px] text-gray-500">
                      {new Date(u.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {u.scheduled_platform ? ` · ${platformLabel(u.scheduled_platform)}` : ""}
                      {u.assigned_publisher_name ? ` · ${u.assigned_publisher_name}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={u.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quick actions */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="mb-3 text-[15px] font-bold text-[#0D1B39]">Jump to</h2>
          <div className="space-y-2">
            <QuickLink href="/admin/content-hub/create" icon={PenLine} label="Create Content" desc="Guided 7-step wizard" />
            <QuickLink href="/admin/content-hub/studio" icon={Clapperboard} label="BSD Studio" desc="Repurpose videos into clips & posts" />
            <QuickLink href="/admin/content-hub/ai" icon={Sparkles} label="AI Assistant" desc="Brainstorm and draft fast" />
            <QuickLink href="/admin/content-hub/approvals" icon={ClipboardCheck} label="Approval Queue" desc="Review pending content" />
          </div>
        </section>
      </div>

      <ActivityPanel page="content-hub" title="Content Hub activity" limit={40} />
    </ContentHubShell>
  );
}

const COLORS: Record<string, { bg: string; icon: string }> = {
  gray: { bg: "bg-gray-50", icon: "text-gray-500" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600" },
  blue: { bg: "bg-blue-50", icon: "text-[#0A4FE8]" },
  violet: { bg: "bg-violet-50", icon: "text-violet-600" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600" },
  slate: { bg: "bg-slate-100", icon: "text-slate-500" },
};
function Stat({ icon: Icon, color, label, value }: { icon: LucideIcon; color: keyof typeof COLORS; label: string; value: number }) {
  const c = COLORS[color];
  return (
    <div className={`${c.bg} rounded-2xl p-4`}>
      <Icon className={`h-5 w-5 ${c.icon}`} />
      <p className="mt-2 text-[22px] font-bold leading-none text-[#0D1B39]">{value}</p>
      <p className="mt-1 text-[11.5px] font-semibold text-gray-500">{label}</p>
    </div>
  );
}
function QuickLink({ href, icon: Icon, label, desc }: { href: string; icon: LucideIcon; label: string; desc: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#0A4FE8]"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-[#0D1B39]">{label}</span>
        <span className="block text-[11.5px] text-gray-500">{desc}</span>
      </span>
    </Link>
  );
}
