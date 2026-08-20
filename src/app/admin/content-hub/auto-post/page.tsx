"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, CheckCircle2, CircleAlert, ExternalLink, Loader2, PlayCircle, RefreshCw, Send, X } from "lucide-react";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import { platformLabel } from "@/lib/content-hub/shared";

interface ScheduleRow {
  id: string;
  content_id: string;
  platform: string;
  scheduled_for: string;
  status: "pending" | "published" | "failed" | "canceled";
  error: string | null;
  external_url: string | null;
  content_title: string;
  created_by: string | null;
}
interface Channel { platform: string; label: string; connected: boolean }

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-blue-50 text-[#0A4FE8]",
  published: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
  canceled: "bg-gray-100 text-gray-500",
};

export default function AutoPostPage() {
  const [schedules, setSchedules] = useState<ScheduleRow[] | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/content-hub/auto-post", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) { setSchedules(json.schedules || []); setChannels(json.channels || []); }
    else setNotice({ tone: "error", text: json.error || "Could not load auto-post schedules." });
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const all = schedules || [];
    const now = Date.now();
    return {
      upcoming: all.filter((s) => s.status === "pending" && new Date(s.scheduled_for).getTime() > now),
      due: all.filter((s) => s.status === "pending" && new Date(s.scheduled_for).getTime() <= now),
      published: all.filter((s) => s.status === "published"),
      failed: all.filter((s) => s.status === "failed"),
    };
  }, [schedules]);

  const connectedCount = channels.filter((c) => c.connected).length;

  async function cancel(id: string) {
    setBusy(id);
    await fetch("/api/admin/content-hub/auto-post", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule_id: id }) });
    setBusy(null);
    await load();
  }

  async function retry(row: ScheduleRow) {
    setBusy(row.id); setNotice(null);
    const res = await fetch(`/api/admin/content-hub/${row.content_id}/publish`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platforms: [row.platform] }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok && json.published) setNotice({ tone: "ok", text: `Published to ${platformLabel(row.platform)}.` });
    else setNotice({ tone: "error", text: json.results?.[0]?.error || json.error || "Retry failed." });
    await load();
  }

  async function runDue() {
    setRunning(true); setNotice(null);
    const res = await fetch("/api/admin/content-hub/auto-post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run_due" }) });
    const json = await res.json().catch(() => ({}));
    setRunning(false);
    if (res.ok) setNotice({ tone: "ok", text: `Ran ${json.ran} due post${json.ran === 1 ? "" : "s"}: ${json.published} published, ${json.failed} failed.` });
    else setNotice({ tone: "error", text: json.error || "Could not run due posts." });
    await load();
  }

  function Row({ s, action }: { s: ScheduleRow; action?: "cancel" | "retry" }) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[s.status]}`}>{s.status}</span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">{platformLabel(s.platform)}</span>
            <p className="truncate text-[13px] font-semibold text-[#0D1B39]">{s.content_title}</p>
          </div>
          <p className="mt-1 text-[11.5px] text-gray-500">
            {new Date(s.scheduled_for).toLocaleString()}
            {s.error ? <span className="text-rose-600"> - {s.error.replace(/^LinkedIn publish failed[^:]*:\s*/, "").slice(0, 120)}</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {s.external_url && (
            <a href={s.external_url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-50">
              <ExternalLink className="h-3.5 w-3.5" /> View
            </a>
          )}
          {action === "cancel" && (
            <button onClick={() => cancel(s.id)} disabled={busy === s.id} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50">
              {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Cancel
            </button>
          )}
          {action === "retry" && (
            <button onClick={() => retry(s)} disabled={busy === s.id} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 text-[12px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-50">
              {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Retry now
            </button>
          )}
        </div>
      </div>
    );
  }

  function Section({ title, icon, rows, action, empty }: { title: string; icon: ReactNode; rows: ScheduleRow[]; action?: "cancel" | "retry"; empty: string }) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2">{icon}<h2 className="text-[14px] font-bold text-[#0D1B39]">{title}</h2><span className="text-[11px] font-semibold text-gray-400">{rows.length}</span></div>
        {rows.length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-[12px] text-gray-400">{empty}</p>
          : <div className="space-y-2">{rows.map((s) => <Row key={s.id} s={s} action={action} />)}</div>}
      </section>
    );
  }

  return (
    <ContentHubShell
      title="Auto-post"
      subtitle="Content scheduled to publish automatically to connected channels."
      action={
        <button onClick={runDue} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Run due now
        </button>
      }
    >
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-2.5 text-[12px] text-[#0D1B39]">
        <Send className="h-4 w-4 text-[#0A4FE8]" />
        {connectedCount > 0
          ? <span>{connectedCount} connected channel{connectedCount === 1 ? "" : "s"}: {channels.filter((c) => c.connected).map((c) => c.label).join(", ")}. Posts fire via the auto-publish worker (every ~5 min).</span>
          : <span>No channels connected. Connect one in <b>Settings -&gt; Auto-publishing channels</b> to enable auto-posting.</span>}
      </div>

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-2.5 text-[13px] ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{notice.text}</div>
      )}

      {schedules === null ? (
        <div className="grid min-h-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {groups.due.length > 0 && (
            <div className="lg:col-span-2"><Section title="Due now (waiting for the worker)" icon={<CircleAlert className="h-4 w-4 text-amber-500" />} rows={groups.due} action="retry" empty="" /></div>
          )}
          <Section title="Upcoming" icon={<CalendarClock className="h-4 w-4 text-[#0A4FE8]" />} rows={groups.upcoming} action="cancel" empty="Nothing scheduled. Use a content item's Publishing package to auto-schedule." />
          <Section title="Failed" icon={<CircleAlert className="h-4 w-4 text-rose-500" />} rows={groups.failed} action="retry" empty="No failures." />
          <div className="lg:col-span-2"><Section title="Published" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} rows={groups.published} empty="No auto-posts published yet." /></div>
        </div>
      )}
    </ContentHubShell>
  );
}
