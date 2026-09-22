"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Boxes, BrainCircuit, Check, ImageIcon, Images, Loader2, Pencil, PenLine, Upload, X, Zap } from "lucide-react";
import Link from "next/link";

type Role = "client" | "team" | "admin";
interface Tool {
  id?: string; slug: string; name: string; shortDescription: string; category: string;
  stage: string; status: "active" | "maintenance" | "disabled"; roleAccess: Role[]; creditCost: number;
  requiresProvider: boolean; providerKey: string | null; isBeta: boolean; isNew: boolean; isFeatured: boolean;
  supportsSimpleMode: boolean; supportsProMode: boolean; outputFormats: string[];
}
interface AdminData {
  tools: Tool[];
  advertBanner: AdvertBanner | null;
  stats: Record<string, number> | null;
  topTools: { tool_slug: string; runs: number; credits: number }[];
}
interface AdvertBanner {
  imageUrl: string | null; altText: string; targetUrl: string | null; isActive: boolean;
  width: number | null; height: number | null; updatedAt: string | null;
}

type SortKey = "name" | "category" | "roles" | "credits" | "status";
type SortDirection = "asc" | "desc";

const STATUS_RANK: Record<Tool["status"], number> = { active: 0, maintenance: 1, disabled: 2 };

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  maintenance: "bg-amber-50 text-amber-700",
  disabled: "bg-gray-100 text-gray-500",
};

function fmtBytes(bytes: number) {
  if (!bytes || bytes < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; let v = bytes, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

export default function AdminCreatePage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tool | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusSavingSlug, setStatusSavingSlug] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "status", direction: "asc" });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/create", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setData(json.data);
    else setNotice({ tone: "error", text: json.error || "Could not load CREATE data." });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function saveTool(tool: Tool) {
    setSaving(true); setNotice(null);
    const res = await fetch("/api/admin/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tool) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setNotice({ tone: "error", text: json.error || "Could not save." }); return; }
    setNotice({ tone: "ok", text: `${tool.name} saved.` });
    setEditing(null);
    await load();
  }

  async function quickStatus(tool: Tool, status: Tool["status"]) {
    if (status === tool.status || statusSavingSlug) return;
    const previousStatus = tool.status;
    setNotice(null);
    setStatusSavingSlug(tool.slug);
    setData((current) => current ? {
      ...current,
      tools: current.tools.map((item) => item.slug === tool.slug ? { ...item, status } : item),
    } : current);
    try {
      const res = await fetch("/api/admin/create", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: tool.slug, status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.tool?.status !== status) {
        throw new Error(json.error || "The saved status could not be verified.");
      }
      setData((current) => current ? {
        ...current,
        tools: current.tools.map((item) => item.slug === tool.slug ? json.tool : item),
      } : current);
      setNotice({ tone: "ok", text: `${tool.name} is now ${status}.` });
    } catch (error) {
      setData((current) => current ? {
        ...current,
        tools: current.tools.map((item) => item.slug === tool.slug ? { ...item, status: previousStatus } : item),
      } : current);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not update the tool status." });
    } finally {
      setStatusSavingSlug(null);
    }
  }

  const stats = data?.stats;
  const sortedTools = useMemo(() => {
    const tools = [...(data?.tools || [])];
    const direction = sort.direction === "asc" ? 1 : -1;
    return tools.sort((a, b) => {
      let result = 0;
      if (sort.key === "status") result = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      else if (sort.key === "credits") result = a.creditCost - b.creditCost;
      else if (sort.key === "roles") result = a.roleAccess.join(",").localeCompare(b.roleAccess.join(","));
      else result = (sort.key === "name" ? a.name : a.category).localeCompare(sort.key === "name" ? b.name : b.category);
      return result === 0 ? a.name.localeCompare(b.name) : result * direction;
    });
  }, [data?.tools, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "status" ? "asc" : "asc" });
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#0A4FE8]"><PenLine className="h-3.5 w-3.5" /> Create management</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#07133B]">Creative tools platform</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-500">Manage CREATE tools, availability, credit cost, and role access. Changes reflect on create.cdsspace.pro immediately.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <Link href="/admin/create/engines" className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#083EC0]"><BrainCircuit className="h-4 w-4" /> AI Engines</Link>
          <Link href="/create?workspace=admin" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-[13px] font-bold text-[#0A4FE8] hover:bg-blue-100"><PenLine className="h-4 w-4" /> Open Create</Link>
        </div>
      </header>

      {notice && <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{notice.text}</div>}

      {loading ? (
        <div className="grid min-h-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>
      ) : (
        <>
          {/* Stats */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "Tools", value: stats?.tools ?? 0, icon: Boxes },
              { label: "Creations", value: stats?.creations ?? 0, icon: Images },
              { label: "Generations", value: stats?.events ?? 0, icon: Zap },
              { label: "Credits used", value: stats?.credits_used ?? 0, icon: BarChart3 },
              { label: "Storage", value: fmtBytes(Number(stats?.storage_used_bytes ?? 0)), icon: Boxes },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <s.icon className="h-4 w-4 text-[#0A4FE8]" />
                <p className="mt-2 text-2xl font-black text-[#07133B]">{s.value}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>

          <AdvertBannerControl
            banner={data?.advertBanner || null}
            onSaved={(advertBanner) => setData((current) => current ? { ...current, advertBanner } : current)}
          />

          {/* Tools table */}
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3.5"><h2 className="text-[15px] font-bold text-[#07133B]">Tools ({data?.tools.length || 0})</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead className="bg-gray-50 text-[11px] text-gray-500">
                  <tr>
                    <SortableHeading label="Tool" sortKey="name" sort={sort} onSort={toggleSort} className="px-5" />
                    <SortableHeading label="Category" sortKey="category" sort={sort} onSort={toggleSort} />
                    <SortableHeading label="Roles" sortKey="roles" sort={sort} onSort={toggleSort} />
                    <SortableHeading label="Credits" sortKey="credits" sort={sort} onSort={toggleSort} />
                    <SortableHeading label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                    <th className="px-5 py-3 text-right font-semibold">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedTools.map((t) => (
                    <tr key={t.slug} className="text-[13px]">
                      <td className="px-5 py-3">
                        <p className="font-bold text-[#07133B]">{t.name} {t.isNew && <span className="ml-1 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-bold text-emerald-700">NEW</span>}{t.isBeta && <span className="ml-1 rounded bg-violet-50 px-1 py-0.5 text-[9px] font-bold text-violet-700">BETA</span>}</p>
                        <p className="max-w-md truncate text-[11px] text-gray-400">{t.shortDescription}</p>
                      </td>
                      <td className="px-3 py-3 text-gray-500">{t.category}</td>
                      <td className="px-3 py-3 text-[11px] text-gray-500">{t.roleAccess.join(", ")}</td>
                      <td className="px-3 py-3 font-semibold text-gray-600">{t.creditCost === 0 ? "Free" : `${t.creditCost} credit${t.creditCost === 1 ? "" : "s"}`}</td>
                      <td className="px-3 py-3">
                        <select aria-label={`Status for ${t.name}`} disabled={statusSavingSlug !== null} value={t.status} onChange={(e) => void quickStatus(t, e.target.value as Tool["status"])} className={`rounded-full border-0 px-2.5 py-1 text-[10px] font-semibold capitalize outline-none disabled:cursor-wait disabled:opacity-60 ${STATUS_STYLE[t.status]}`}>
                          <option value="active">active</option><option value="maintenance">maintenance</option><option value="disabled">disabled</option>
                        </select>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => setEditing(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top tools */}
          {(data?.topTools?.length || 0) > 0 && (
            <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-[15px] font-bold text-[#07133B]">Most used tools</h2>
              <div className="space-y-2">
                {data!.topTools.map((row) => (
                  <div key={row.tool_slug} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-[12px]">
                    <span className="font-semibold text-[#07133B]">{row.tool_slug}</span>
                    <span className="text-gray-500">{row.runs} run{row.runs === 1 ? "" : "s"} - {row.credits} credits</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {editing && <EditToolModal tool={editing} onClose={() => setEditing(null)} onSave={saveTool} saving={saving} />}
    </main>
  );
}

function AdvertBannerControl({ banner, onSaved }: { banner: AdvertBanner | null; onSaved: (banner: AdvertBanner) => void }) {
  const [draft, setDraft] = useState({
    altText: banner?.altText || "CDS Space Create promotion",
    targetUrl: banner?.targetUrl || "",
    isActive: banner?.isActive || false,
  });
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDraft({ altText: banner?.altText || "CDS Space Create promotion", targetUrl: banner?.targetUrl || "", isActive: banner?.isActive || false });
  }, [banner?.altText, banner?.targetUrl, banner?.isActive]);

  useEffect(() => {
    if (!dirty) return;
    setState("saving");
    const timer = window.setTimeout(async () => {
      const res = await fetch("/api/admin/create/banner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not save the banner settings.");
        setState("error");
        return;
      }
      setDirty(false);
      setError("");
      setState("saved");
      onSaved(json.banner);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, onSaved]);

  function update(patch: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  async function upload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setState("saving");
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("altText", draft.altText);
    form.set("targetUrl", draft.targetUrl);
    form.set("isActive", String(draft.isActive));
    const res = await fetch("/api/admin/create/banner", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setState("error");
      setError(json.error || "Could not upload the banner.");
      return;
    }
    setDirty(false);
    setState("saved");
    onSaved(json.banner);
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-bold text-[#07133B]"><ImageIcon className="h-4 w-4 text-[#0A4FE8]" /> Create dashboard advert</p>
          <p className="mt-1 text-[12px] text-gray-500">Displayed directly beneath Quick Start for every Create user.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-semibold ${state === "error" ? "text-rose-600" : state === "saving" ? "text-amber-600" : "text-emerald-600"}`}>
            {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Save failed" : "Autosaves"}
          </span>
          <button type="button" role="switch" aria-checked={draft.isActive} onClick={() => update({ isActive: !draft.isActive })} className={`relative h-7 w-12 rounded-full transition ${draft.isActive ? "bg-[#0A4FE8]" : "bg-gray-200"}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${draft.isActive ? "left-6" : "left-1"}`} />
          </button>
          <span className="text-[12px] font-semibold text-gray-600">{draft.isActive ? "Live" : "Hidden"}</span>
        </div>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="aspect-[16/5] overflow-hidden rounded-xl border border-dashed border-blue-200 bg-blue-50/40">
            {banner?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner.imageUrl} alt={draft.altText} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center px-5 text-center">
                <div><ImageIcon className="mx-auto h-7 w-7 text-[#0A4FE8]" /><p className="mt-2 text-[12px] font-semibold text-[#07133B]">No banner uploaded</p></div>
              </div>
            )}
          </div>
          {banner?.width && banner?.height && <p className="mt-2 text-[11px] text-gray-400">Current artwork: {banner.width} × {banner.height} px</p>}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11.5px] leading-5 text-blue-900">
            <strong>Recommended size: 1600 × 500 px (3.2:1).</strong> PNG, JPG or WebP, maximum 5MB. Artwork within 20% of the ratio is accepted. Keep important text and logos inside the centre 80% so it remains clear on mobile, tablet and desktop.
          </div>
          <label className="block text-[12px] font-semibold text-gray-600">Accessible description
            <input value={draft.altText} onChange={(event) => update({ altText: event.target.value })} maxLength={180} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" />
          </label>
          <label className="block text-[12px] font-semibold text-gray-600">Destination link
            <input value={draft.targetUrl} onChange={(event) => update({ targetUrl: event.target.value })} placeholder="/pricing or https://example.com" className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-[#083EC0]">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : banner?.imageUrl ? "Replace artwork" : "Upload artwork"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0] || null)} />
          </label>
          {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}
        </div>
      </div>
    </section>
  );
}

function SortableHeading({ label, sortKey, sort, onSort, className = "" }: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`py-3 pr-3 font-semibold ${className}`} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-[#0A4FE8]">
        {label}<Icon className={`h-3.5 w-3.5 ${active ? "text-[#0A4FE8]" : "text-gray-300"}`} />
      </button>
    </th>
  );
}

function EditToolModal({ tool, onClose, onSave, saving }: { tool: Tool; onClose: () => void; onSave: (t: Tool) => void; saving: boolean }) {
  const [draft, setDraft] = useState<Tool>(tool);
  const [pricingMode, setPricingMode] = useState<"free" | "credits">(tool.creditCost === 0 ? "free" : "credits");
  const set = (patch: Partial<Tool>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleRole = (role: Role) => set({ roleAccess: draft.roleAccess.includes(role) ? draft.roleAccess.filter((r) => r !== role) : [...draft.roleAccess, role] });

  function choosePricingMode(mode: "free" | "credits") {
    setPricingMode(mode);
    set({ creditCost: mode === "free" ? 0 : Math.max(1, draft.creditCost || 1) });
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#07133B]/50 p-4 backdrop-blur-sm sm:p-6">
      <div onClick={(e) => e.stopPropagation()} className="my-6 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[15px] font-bold text-[#07133B]">Edit {tool.name}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block text-[12px] font-semibold text-gray-600">Name<input value={draft.name} onChange={(e) => set({ name: e.target.value })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" /></label>
          <label className="block text-[12px] font-semibold text-gray-600">Short description<textarea value={draft.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} rows={2} className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] outline-none focus:border-blue-300 focus:bg-white" /></label>
          <label className="block text-[12px] font-semibold text-gray-600">Category<input value={draft.category} onChange={(e) => set({ category: e.target.value })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" /></label>
          <fieldset className="rounded-xl border border-gray-200 p-3">
            <legend className="px-1 text-[12px] font-semibold text-gray-600">Usage pricing</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => choosePricingMode("free")} aria-pressed={pricingMode === "free"} className={`rounded-xl border px-3 py-2.5 text-[12px] font-semibold transition ${pricingMode === "free" ? "border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>Free</button>
              <button type="button" onClick={() => choosePricingMode("credits")} aria-pressed={pricingMode === "credits"} className={`rounded-xl border px-3 py-2.5 text-[12px] font-semibold transition ${pricingMode === "credits" ? "border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>Credit-based</button>
            </div>
            {pricingMode === "credits" ? (
              <label className="mt-3 block text-[12px] font-semibold text-gray-600">Credits per use
                <input type="number" inputMode="numeric" min={1} max={100000} step={1} value={draft.creditCost} onChange={(e) => set({ creditCost: Math.min(100000, Math.max(1, Math.trunc(Number(e.target.value) || 1))) })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" />
              </label>
            ) : <p className="mt-3 text-[11px] leading-5 text-gray-500">Users can run this tool without using any Create credits.</p>}
          </fieldset>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-gray-600">Role access</p>
            <div className="flex gap-2">
              {(["client", "team", "admin"] as Role[]).map((r) => (
                <button key={r} type="button" onClick={() => toggleRole(r)} className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold capitalize ${draft.roleAccess.includes(r) ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-gray-200 text-gray-500"}`}>{draft.roleAccess.includes(r) && <Check className="mr-1 inline h-3 w-3" />}{r}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            {([["isFeatured", "Featured"], ["isNew", "New"], ["isBeta", "Beta"]] as [keyof Tool, string][]).map(([key, label]) => (
              <label key={String(key)} className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-600"><input type="checkbox" checked={Boolean(draft[key])} onChange={(e) => set({ [key]: e.target.checked } as Partial<Tool>)} className="h-4 w-4 rounded" /> {label}</label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onSave(draft)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
        </div>
      </div>
    </div>
  );
}
