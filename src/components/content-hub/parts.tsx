"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Image as ImageIcon, Video, FileText, CheckCircle2, CalendarClock, Loader2, X, Send } from "lucide-react";
import { STATUS_META, platformLabel, type ContentItem, type ContentStatus } from "@/lib/content-hub/shared";

export function StatusBadge({ status }: { status: ContentStatus }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export function PlatformPills({ platforms }: { platforms: string[] }) {
  if (!platforms?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {platforms.map((p) => (
        <span key={p} className="rounded-md bg-gray-100 px-2 py-0.5 text-[10.5px] font-medium text-gray-600">
          {platformLabel(p)}
        </span>
      ))}
    </div>
  );
}

/** Compose the full, copy-ready caption: body + CTA + hashtags. */
export function buildCaption(item: Pick<ContentItem, "body" | "cta_label" | "cta_url" | "hashtags">): string {
  const parts: string[] = [];
  if (item.body) parts.push(item.body.trim());
  if (item.cta_label) parts.push(`${item.cta_label}${item.cta_url ? ` ${item.cta_url}` : ""}`);
  if (item.hashtags?.length) parts.push(item.hashtags.join(" "));
  return parts.join("\n\n");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch { /* clipboard blocked */ }
      }}
      className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#083EC0]"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </button>
  );
}

const KIND_ICON = { image: ImageIcon, video: Video, pdf: FileText, document: FileText, clip: Video } as const;

interface ChannelSummary {
  platform: string;
  label: string;
  connected: boolean;
}
interface ScheduleRow {
  id: string;
  platform: string;
  scheduled_for: string;
  status: string;
  error: string | null;
}

/** Default the datetime picker to the next round hour, in local time. */
function defaultScheduleValue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Auto-schedule this content item to one or more CONNECTED channels at a set
 * time. The content-autopublish cron fires each due schedule automatically.
 */
function AutoScheduleChannels({ contentId }: { contentId: string }) {
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [when, setWhen] = useState<string>(defaultScheduleValue);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [chRes, scRes] = await Promise.all([
      fetch("/api/admin/content-hub/social", { cache: "no-store" }),
      fetch(`/api/admin/content-hub/${contentId}/schedule`, { cache: "no-store" }),
    ]);
    const ch = await chRes.json().catch(() => ({}));
    const sc = await scRes.json().catch(() => ({}));
    if (chRes.ok) setChannels(ch.channels || []);
    if (scRes.ok) setSchedules(sc.schedules || []);
  }, [contentId]);

  useEffect(() => { void load(); }, [load]);

  const connected = (channels || []).filter((c) => c.connected);

  function toggle(platform: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(platform)) next.delete(platform); else next.add(platform);
      return next;
    });
  }

  async function schedule() {
    if (!selected.size) { setNotice({ tone: "error", text: "Pick at least one connected platform." }); return; }
    setSaving(true); setNotice(null);
    const res = await fetch(`/api/admin/content-hub/${contentId}/schedule`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      // Send an ISO string in the user's local timezone.
      body: JSON.stringify({ platforms: Array.from(selected), scheduled_for: new Date(when).toISOString() }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setNotice({ tone: "error", text: json.error || "Could not schedule." }); return; }
    setNotice({ tone: "ok", text: `Scheduled for ${(json.scheduled || []).map((p: string) => platformLabel(p)).join(", ")} at ${new Date(json.scheduled_for).toLocaleString()}.` });
    setSelected(new Set());
    await load();
  }

  async function cancel(scheduleId: string) {
    await fetch(`/api/admin/content-hub/${contentId}/schedule`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule_id: scheduleId }),
    });
    await load();
  }

  const pending = schedules.filter((s) => s.status === "pending");

  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-3.5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-[#0A4FE8]" />
        <p className="text-[13px] font-bold text-[#0D1B39]">Auto-schedule to connected channels</p>
      </div>

      {channels === null ? (
        <div className="grid place-items-center py-4"><Loader2 className="h-4 w-4 animate-spin text-[#0A4FE8]" /></div>
      ) : connected.length === 0 ? (
        <p className="mt-2 text-[12px] text-gray-500">No channels connected yet. Connect one in Content Hub -&gt; Settings -&gt; Auto-publishing channels.</p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-gray-500">Select platforms and a time. The post publishes automatically.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {connected.map((c) => {
              const on = selected.has(c.platform);
              return (
                <button key={c.platform} type="button" onClick={() => toggle(c.platform)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${on ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-gray-200 bg-white text-[#0D1B39] hover:border-blue-200"}`}>
                  {on && <Check className="h-3.5 w-3.5" />} {c.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="datetime-local" value={when} min={defaultScheduleValue()} onChange={(e) => setWhen(e.target.value)}
              className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-[12.5px] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
            <button type="button" onClick={schedule} disabled={saving || !selected.size}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#0A4FE8] px-4 text-[12.5px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Schedule post
            </button>
          </div>
        </>
      )}

      {notice && (
        <p className={`mt-2.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{notice.text}</p>
      )}

      {pending.length > 0 && (
        <div className="mt-3 border-t border-blue-100 pt-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Scheduled</p>
          <div className="mt-1.5 space-y-1.5">
            {pending.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5">
                <span className="text-[12px] text-[#0D1B39]"><b>{platformLabel(s.platform)}</b> - {new Date(s.scheduled_for).toLocaleString()}</span>
                <button type="button" onClick={() => cancel(s.id)} title="Cancel" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-rose-500"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The publishing package the Social Media Manager uses: copy the caption,
 * download each asset, download all, and mark the content as published.
 */
export function PublishingPackage({
  item,
  onMarkPublished,
  canPublish = true,
}: {
  item: ContentItem;
  onMarkPublished?: () => void;
  canPublish?: boolean;
}) {
  const caption = buildCaption(item);
  const media = item.media || [];

  // Save the asset to the device instead of opening it in a new tab. GlashDB
  // storage serves any public object as an attachment when the URL carries a
  // `?download=<name>` param, so this forces a real download even cross-origin.
  const downloadOne = (url: string, name?: string | null) => {
    const filename = name || url.split("/").pop()?.split("?")[0] || "asset";
    const sep = url.includes("?") ? "&" : "?";
    const a = document.createElement("a");
    a.href = `${url}${sep}download=${encodeURIComponent(filename)}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadAll = () => {
    // Stagger so the browser doesn't drop concurrent downloads.
    media.forEach((m, i) => setTimeout(() => downloadOne(m.url, m.file_name || `asset-${i + 1}`), i * 350));
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-[14px] font-bold text-[#0D1B39]">Publishing package</h3>
      <p className="text-[12px] text-gray-500">Copy the caption, download the assets, post, then mark it published.</p>

      <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-gray-100 bg-gray-50 p-3 text-[13px] leading-6 text-[#0D1B39]">
        {caption || "No caption yet."}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton text={caption} label="Copy Content" />
        {media.length > 0 && (
          <button
            type="button"
            onClick={downloadAll}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0D1B39] transition hover:border-blue-200 hover:bg-blue-50"
          >
            <Download className="h-4 w-4" />
            Download all assets
          </button>
        )}
        {canPublish && item.status !== "published" && onMarkPublished && (
          <button
            type="button"
            onClick={onMarkPublished}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark as published
          </button>
        )}
      </div>

      {canPublish && <AutoScheduleChannels contentId={item.id} />}

      {media.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((m) => {
            const Icon = KIND_ICON[m.kind] || FileText;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => downloadOne(m.url, m.file_name)}
                title={`Download ${m.file_name || m.kind}`}
                className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50"
              >
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.file_name || "asset"} className="h-full w-full object-cover" />
                ) : (
                  <Icon className="h-7 w-7 text-gray-400" />
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/45 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                  <span className="truncate">{m.file_name || m.kind}</span>
                  <Download className="h-3 w-3 shrink-0" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
