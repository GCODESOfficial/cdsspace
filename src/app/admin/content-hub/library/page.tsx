"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X, Loader2, Trash2, CheckCircle2, CalendarClock, Archive, ShieldCheck } from "lucide-react";
import { appAlert, appConfirm } from "@/lib/app-notify";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import { StatusBadge, PlatformPills, PublishingPackage } from "@/components/content-hub/parts";
import { CONTENT_TYPES, PLATFORMS, STATUS_META, type ContentItem, type ContentStatus } from "@/lib/content-hub/shared";

const STATUS_FILTERS: (ContentStatus | "")[] = ["", "draft", "pending", "approved", "scheduled", "published", "archived"];

function LibraryInner() {
  const params = useSearchParams();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ContentItem | null>(null);
  const [filters, setFilters] = useState({ status: "", type: "", platform: "", search: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.status) qs.set("status", filters.status);
    if (filters.type) qs.set("type", filters.type);
    if (filters.platform) qs.set("platform", filters.platform);
    if (filters.search) qs.set("search", filters.search);
    const res = await fetch(`/api/admin/content-hub?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setItems(json.items);
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Deep-link: ?id=... opens that item.
  useEffect(() => {
    const id = params.get("id");
    if (!id) return;
    fetch(`/api/admin/content-hub/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setActive(d.item); })
      .catch(() => {});
  }, [params]);

  async function patch(id: string, body: Record<string, unknown>, successMsg: string) {
    const res = await fetch(`/api/admin/content-hub/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) { await appAlert({ title: "Update", message: json.error || "Failed.", kind: "error" }); return; }
    await appAlert({ title: "Done", message: successMsg, kind: "success" });
    setActive(json.item ? { ...json.item, media: active?.media } : null);
    load();
  }

  async function remove(id: string) {
    const ok = await appConfirm({ title: "Delete content", message: "This moves it to deleted. Continue?", destructive: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/content-hub/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) { setActive(null); load(); }
  }

  return (
    <ContentHubShell title="Content Library" subtitle="Central repository - filter, search, package and track every piece of content.">
      {/* Filters */}
      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search title, keyword, tag..."
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-[13px] text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
          </div>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] font-medium text-[#0D1B39]">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s ? STATUS_META[s as ContentStatus].label : "All statuses"}</option>)}
          </select>
          <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] font-medium text-[#0D1B39]">
            <option value="">All types</option>
            {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filters.platform} onChange={(e) => setFilters({ ...filters, platform: e.target.value })} className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] font-medium text-[#0D1B39]">
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-[13px] text-gray-400 shadow-sm">No content found.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => setActive(item)} className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md">
              <div className="mb-2 flex items-center justify-between gap-2">
                <StatusBadge status={item.status} />
                <span className="text-[10.5px] text-gray-400">{item.content_type || "-"}</span>
              </div>
              {item.media && item.media[0]?.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.media[0].url} alt="" className="mb-2 h-28 w-full rounded-xl object-cover" />
              )}
              <p className="line-clamp-1 text-[14px] font-bold text-[#0D1B39]">{item.title}</p>
              <p className="mt-1 line-clamp-2 text-[12px] text-gray-500">{item.body || "No caption"}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <PlatformPills platforms={item.platforms} />
                {item.scheduled_at && <span className="text-[10.5px] font-medium text-violet-600">{new Date(item.scheduled_at).toLocaleDateString()}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {active && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setActive(null)}>
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2"><StatusBadge status={active.status} /><span className="text-[11px] text-gray-400">{active.content_type}</span></div>
                <h2 className="text-[18px] font-bold text-[#0D1B39]">{active.title}</h2>
              </div>
              <button onClick={() => setActive(null)} className="rounded-full p-2 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            {/* Status actions */}
            <div className="mb-4 flex flex-wrap gap-2">
              {active.status === "pending" && <Action icon={ShieldCheck} label="Approve" onClick={() => patch(active.id, { status: "approved" }, "Approved.")} />}
              {(active.status === "approved" || active.status === "draft") && active.scheduled_at && <Action icon={CalendarClock} label="Schedule" onClick={() => patch(active.id, { status: "scheduled" }, "Scheduled.")} />}
              {active.status !== "published" && <Action icon={CheckCircle2} label="Mark published" tone="emerald" onClick={() => patch(active.id, { status: "published" }, "Marked published.")} />}
              {active.status !== "archived" && <Action icon={Archive} label="Archive" onClick={() => patch(active.id, { status: "archived" }, "Archived.")} />}
              <Action icon={Trash2} label="Delete" tone="red" onClick={() => remove(active.id)} />
            </div>

            <PublishingPackage item={active} onMarkPublished={() => patch(active.id, { status: "published" }, "Marked published.")} />

            {/* Performance notes */}
            <PerformanceForm item={active} onSave={(body) => patch(active.id, body, "Performance saved.")} />
          </div>
        </div>
      )}
    </ContentHubShell>
  );
}

function Action({ icon: Icon, label, onClick, tone }: { icon: typeof X; label: string; onClick: () => void; tone?: "emerald" | "red" }) {
  const cls = tone === "emerald" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : tone === "red" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-gray-200 text-[#0D1B39] hover:bg-blue-50 hover:border-blue-200";
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition ${cls}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function PerformanceForm({ item, onSave }: { item: ContentItem; onSave: (body: Record<string, unknown>) => void }) {
  const [f, setF] = useState({
    posted_url: item.posted_url || "", reach: item.reach ?? "", engagement: item.engagement ?? "", leads: item.leads ?? "", performance_notes: item.performance_notes || "",
  });
  return (
    <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="text-[14px] font-bold text-[#0D1B39]">Performance notes</h3>
      <p className="text-[12px] text-gray-500">Recorded by the publisher after posting.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input value={f.posted_url} onChange={(e) => setF({ ...f, posted_url: e.target.value })} placeholder="Posted URL" className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] sm:col-span-2" />
        <input value={String(f.reach)} onChange={(e) => setF({ ...f, reach: e.target.value })} placeholder="Reach" inputMode="numeric" className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px]" />
        <input value={String(f.engagement)} onChange={(e) => setF({ ...f, engagement: e.target.value })} placeholder="Engagement" inputMode="numeric" className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px]" />
        <input value={String(f.leads)} onChange={(e) => setF({ ...f, leads: e.target.value })} placeholder="Leads generated" inputMode="numeric" className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] sm:col-span-2" />
        <textarea value={f.performance_notes} onChange={(e) => setF({ ...f, performance_notes: e.target.value })} placeholder="Notes" rows={2} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12.5px] sm:col-span-2" />
      </div>
      <button type="button" onClick={() => onSave(f)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#083EC0]">Save performance</button>
    </div>
  );
}

export default function ContentLibraryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
      <LibraryInner />
    </Suspense>
  );
}
