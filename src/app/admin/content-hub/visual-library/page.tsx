"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  CheckSquare,
  Upload,
  Video,
  X,
} from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import type { VisualAsset, VisualAssetKind, VisualAssetStatus } from "@/lib/content-hub/shared";
import { validateContentHubUpload } from "@/lib/content-hub/upload-limits";

const STATUS_OPTIONS: { value: "" | VisualAssetStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "used", label: "Used" },
  { value: "archived", label: "Archived" },
];

const STATUS_STYLE: Record<VisualAssetStatus, string> = {
  available: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  used: "bg-blue-50 text-[#0A4FE8] ring-1 ring-blue-200",
  archived: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
};

export default function VisualLibraryPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<VisualAsset[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<VisualAsset | null>(null);
  const [filters, setFilters] = useState<{ kind: "" | VisualAssetKind; status: "" | VisualAssetStatus; search: string }>({
    kind: "",
    status: "available",
    search: "",
  });
  const [uploadMeta, setUploadMeta] = useState({ tags: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.kind) qs.set("kind", filters.kind);
    if (filters.status) qs.set("status", filters.status);
    if (filters.search) qs.set("search", filters.search);
    qs.set("limit", "300");
    const res = await fetch(`/api/admin/content-hub/visual-library?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json();
    if (json.ok) {
      setItems(json.items || []);
      setCounts(json.counts || {});
      setSelected((old) => new Set([...old].filter((id) => (json.items || []).some((item: VisualAsset) => item.id === id))));
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!previewing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewing(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewing]);

  const selectedItems = useMemo(() => items.filter((item) => selected.has(item.id)), [items, selected]);
  const allVisibleSelected = items.length > 0 && selectedItems.length === items.length;

  function toggleSelected(id: string) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((old) => {
      const next = new Set(old);
      if (allVisibleSelected) items.forEach((item) => next.delete(item.id));
      else items.forEach((item) => next.add(item.id));
      return next;
    });
  }

  async function readJson(res: Response) {
    return res.json().catch(() => ({
      ok: false,
      error: res.status === 413
        ? "Upload is too large. Videos can be up to 100MB each."
        : "Upload failed before the server returned details.",
    }));
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    const invalid = files
      .map((file) => validateContentHubUpload(file.size, file.type, file.name))
      .find((result) => !result.ok);
    if (invalid && !invalid.ok) {
      await appAlert({ title: "Upload failed", message: invalid.error, kind: "error" });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setWorking("upload");
    try {
      let uploadedCount = 0;
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        if (uploadMeta.tags.trim()) fd.append("tags", uploadMeta.tags);
        if (uploadMeta.notes.trim()) fd.append("notes", uploadMeta.notes);

        const res = await fetch("/api/admin/content-hub/visual-library", { method: "POST", body: fd });
        const json = await readJson(res);
        if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed.");
        uploadedCount += json.items?.length || 1;
      }
      await appAlert({ title: "Visual Library", message: `${uploadedCount} file(s) uploaded.`, kind: "success" });
      setFilters((f) => ({ ...f, status: "available" }));
      await load();
    } catch (error) {
      await appAlert({ title: "Upload failed", message: error instanceof Error ? error.message : "Upload failed.", kind: "error" });
    } finally {
      setWorking(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function patchAsset(id: string, status: VisualAssetStatus) {
    setWorking(id);
    try {
      const res = await fetch(`/api/admin/content-hub/visual-library/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Update failed.");
      await load();
    } catch (error) {
      await appAlert({ title: "Visual Library", message: error instanceof Error ? error.message : "Update failed.", kind: "error" });
    } finally {
      setWorking(null);
    }
  }

  async function bulk(action: "used" | "available" | "archive") {
    if (!selectedItems.length) {
      await appAlert({ title: "Visual Library", message: "Select at least one item first.", kind: "error" });
      return;
    }
    setWorking(`bulk-${action}`);
    try {
      const res = await fetch("/api/admin/content-hub/visual-library/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selectedItems.map((item) => item.id) }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Bulk update failed.");
      setSelected(new Set());
      await appAlert({ title: "Updated", message: `${json.count || selectedItems.length} item(s) updated.`, kind: "success" });
      await load();
    } catch (error) {
      await appAlert({ title: "Visual Library", message: error instanceof Error ? error.message : "Bulk update failed.", kind: "error" });
    } finally {
      setWorking(null);
    }
  }

  return (
    <ContentHubShell title="Visual Library" subtitle="Upload prepared photos and videos, then let content creators choose them for image or video generation.">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(event) => upload(Array.from(event.target.files || []))}
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={ImageIcon} label="Available" value={counts.available || 0} tone="emerald" />
        <Stat icon={CheckCircle2} label="Used" value={counts.used || 0} tone="blue" />
        <Stat icon={Archive} label="Archived" value={counts.archived || 0} tone="slate" />
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                placeholder="Search title, file name, notes, tags..."
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-[13px] text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <select value={filters.kind} onChange={(event) => setFilters({ ...filters, kind: event.target.value as "" | VisualAssetKind })} className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] font-medium text-[#0D1B39]">
              <option value="">All media</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as "" | VisualAssetStatus })} className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] font-medium text-[#0D1B39]">
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={load} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-[13px] font-bold text-[#0D1B39] transition hover:bg-gray-50">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={working === "upload"} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[13px] font-bold text-white transition hover:bg-[#083EC0] disabled:opacity-60">
              {working === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={uploadMeta.tags}
            onChange={(event) => setUploadMeta({ ...uploadMeta, tags: event.target.value })}
            placeholder="Upload tags, comma separated"
            className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <input
            value={uploadMeta.notes}
            onChange={(event) => setUploadMeta({ ...uploadMeta, notes: event.target.value })}
            placeholder="Upload notes"
            className="h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] text-[#0D1B39] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={toggleAllVisible} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-bold text-[#0D1B39] transition hover:bg-gray-50">
            {allVisibleSelected ? <CheckSquare className="h-4 w-4 text-[#0A4FE8]" /> : <Square className="h-4 w-4 text-gray-400" />}
            {selectedItems.length ? `${selectedItems.length} selected` : "Select visible"}
          </button>
          {selectedItems.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <BulkButton icon={CheckCircle2} label="Mark used" busy={working === "bulk-used"} onClick={() => bulk("used")} />
              <BulkButton icon={RotateCcw} label="Make available" busy={working === "bulk-available"} onClick={() => bulk("available")} />
              <BulkButton icon={Archive} label="Archive" busy={working === "bulk-archive"} onClick={() => bulk("archive")} />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center text-[13px] font-semibold text-gray-400">No visual assets found.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <VisualCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                working={working === item.id}
                onSelect={() => toggleSelected(item.id)}
                onStatus={(status) => patchAsset(item.id, status)}
                onPreview={() => setPreviewing(item)}
              />
            ))}
          </div>
        )}
      </section>

      {previewing && <PreviewModal item={previewing} onClose={() => setPreviewing(null)} />}
    </ContentHubShell>
  );
}

function VisualCard({
  item,
  selected,
  working,
  onSelect,
  onStatus,
  onPreview,
}: {
  item: VisualAsset;
  selected: boolean;
  working: boolean;
  onSelect: () => void;
  onStatus: (status: VisualAssetStatus) => void;
  onPreview: () => void;
}) {
  return (
    <article className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition ${selected ? "border-[#0A4FE8] ring-2 ring-blue-100" : "border-gray-100 hover:border-blue-200"}`}>
      <div className="relative flex aspect-video items-center justify-center bg-gray-50">
        {item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
            <Video className="h-9 w-9" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Video</span>
          </div>
        )}
        <button type="button" onClick={onPreview} aria-label={`Preview ${item.title || item.file_name || "visual asset"}`} className="absolute inset-0 z-10" />
        <button type="button" onClick={onSelect} className="absolute left-2 top-2 z-20 rounded-lg bg-white/95 p-1.5 text-[#0D1B39] shadow-sm transition hover:bg-white">
          {selected ? <CheckSquare className="h-4 w-4 text-[#0A4FE8]" /> : <Square className="h-4 w-4 text-gray-400" />}
        </button>
        <span className={`pointer-events-none absolute right-2 top-2 z-20 rounded-full px-2 py-1 text-[10.5px] font-bold capitalize ${STATUS_STYLE[item.status]}`}>{item.status}</span>
        <span className="pointer-events-none absolute bottom-2 right-2 z-20 rounded-full bg-black/55 px-2 py-1 text-[10.5px] font-bold text-white opacity-0 transition group-hover:opacity-100">Preview</span>
      </div>
      <div className="p-3">
        <button type="button" onClick={onPreview} className="flex w-full items-start gap-2 rounded-lg text-left transition hover:bg-gray-50">
          {item.kind === "image" ? <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#0A4FE8]" /> : <Video className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-[#0D1B39]">{item.title || item.file_name || "Untitled asset"}</p>
            <p className="mt-0.5 text-[11.5px] text-gray-400">{formatBytes(item.size_bytes)} · {new Date(item.created_at).toLocaleDateString()}</p>
          </div>
        </button>
        {item.notes && <p className="mt-2 line-clamp-2 text-[12px] text-gray-500">{item.notes}</p>}
        {item.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-semibold text-gray-500">{tag}</span>)}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <IconButton title="Mark used" disabled={working} onClick={() => onStatus("used")} icon={CheckCircle2} />
          <IconButton title="Make available" disabled={working} onClick={() => onStatus("available")} icon={RotateCcw} />
          <IconButton title="Archive" disabled={working} onClick={() => onStatus("archived")} icon={Archive} />
        </div>
      </div>
    </article>
  );
}

function IconButton({ title, disabled, onClick, icon: Icon }: { title: string; disabled: boolean; onClick: () => void; icon: typeof Archive }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0A4FE8] disabled:opacity-50">
      {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
    </button>
  );
}

function PreviewModal({ item, onClose }: { item: VisualAsset; onClose: () => void }) {
  const title = item.title || item.file_name || "Visual asset";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#061126]/80 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {item.kind === "image" ? <ImageIcon className="h-4 w-4 text-[#0A4FE8]" /> : <Video className="h-4 w-4 text-violet-600" />}
              <h2 className="truncate text-[15px] font-bold text-[#0D1B39]">{title}</h2>
            </div>
            <p className="mt-1 text-[11.5px] text-gray-400">{formatBytes(item.size_bytes)} · {new Date(item.created_at).toLocaleDateString()}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={item.url} target="_blank" rel="noreferrer" title="Open original" aria-label="Open original" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0A4FE8]">
              <ExternalLink className="h-4 w-4" />
            </a>
            <button type="button" onClick={onClose} title="Close preview" aria-label="Close preview" className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0A4FE8] text-white transition hover:bg-[#083EC0]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950">
          {item.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={title} className="max-h-[78vh] w-auto max-w-full object-contain" />
          ) : (
            <video src={item.url} controls playsInline preload="metadata" className="max-h-[78vh] w-full max-w-full bg-black" />
          )}
        </div>

        {(item.notes || item.tags?.length > 0) && (
          <div className="space-y-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            {item.notes && <p className="text-[12.5px] leading-5 text-gray-600">{item.notes}</p>}
            {item.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-semibold text-gray-500">{tag}</span>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BulkButton({ icon: Icon, label, busy, onClick }: { icon: typeof Archive; label: string; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={busy} onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-bold text-[#0D1B39] transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-60">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {label}
    </button>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Archive; label: string; value: number; tone: "emerald" | "blue" | "slate" }) {
  const cls = tone === "emerald" ? "bg-emerald-50 text-emerald-700" : tone === "blue" ? "bg-blue-50 text-[#0A4FE8]" : "bg-slate-100 text-slate-500";
  return (
    <div className={`${cls} rounded-2xl p-4`}>
      <Icon className="h-5 w-5" />
      <p className="mt-2 text-[22px] font-bold leading-none text-[#0D1B39]">{value}</p>
      <p className="mt-1 text-[11.5px] font-semibold text-gray-500">{label}</p>
    </div>
  );
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
