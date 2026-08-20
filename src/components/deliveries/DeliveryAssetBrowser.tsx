"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Grid2X2,
  Image as ImageIcon,
  LayoutList,
  Search,
  X,
} from "lucide-react";
import type { PublicDeliveryFile } from "@/lib/public-delivery";

type DeliveryView = "folder" | "flat";

function normalizePath(file: PublicDeliveryFile) {
  const path = (file.relative_path || file.file_name).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  return path || file.file_name;
}

function parentPath(path: string) {
  const segments = path.split("/");
  segments.pop();
  return segments.join("/");
}

function baseName(path: string) {
  return path.split("/").filter(Boolean).pop() || path;
}

function fileIcon(file: PublicDeliveryFile) {
  if (file.file_kind === "image") return ImageIcon;
  if (file.file_kind === "archive") return Archive;
  return FileText;
}

export function DeliveryAssetBrowser({ token, files }: { token: string; files: PublicDeliveryFile[] }) {
  const [view, setView] = useState<DeliveryView>("folder");
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");

  const preparedFiles = useMemo(
    () => files.map((file) => ({ ...file, path: normalizePath(file) })),
    [files],
  );
  const allFolders = useMemo(() => {
    const paths = new Set<string>();
    preparedFiles.forEach((file) => {
      const segments = file.path.split("/").slice(0, -1);
      segments.forEach((_, index) => paths.add(segments.slice(0, index + 1).join("/")));
    });
    return Array.from(paths).sort((a, b) => a.localeCompare(b));
  }, [preparedFiles]);
  const folderAssetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    preparedFiles.forEach((file) => {
      const segments = file.path.split("/").slice(0, -1);
      segments.forEach((_, index) => {
        const folder = segments.slice(0, index + 1).join("/");
        counts.set(folder, (counts.get(folder) || 0) + 1);
      });
    });
    return counts;
  }, [preparedFiles]);
  const childFolders = useMemo(
    () => allFolders.filter((folder) => parentPath(folder) === currentPath),
    [allFolders, currentPath],
  );
  const currentFiles = useMemo(
    () => preparedFiles.filter((file) => parentPath(file.path) === currentPath),
    [currentPath, preparedFiles],
  );
  const filteredFiles = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return preparedFiles;
    return preparedFiles.filter((file) => `${file.file_name} ${file.path}`.toLocaleLowerCase().includes(term));
  }, [preparedFiles, query]);
  const breadcrumbs = currentPath ? currentPath.split("/") : [];
  const folderCount = allFolders.length;
  const rootFolderCount = allFolders.filter((folder) => !folder.includes("/")).length;
  const showingSearch = Boolean(query.trim());

  function openBreadcrumb(index: number) {
    setCurrentPath(breadcrumbs.slice(0, index + 1).join("/"));
  }

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-[#DFE6F1] bg-[#F8FAFD]">
      <div className="border-b border-[#E4EAF3] bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1 xl:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A95AA]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this delivery..."
              className="h-11 w-full rounded-xl border border-[#DFE6F1] bg-[#F8FAFD] pl-10 pr-10 text-xs font-medium text-[#07133B] outline-none placeholder:text-[#9AA4B7] focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100"
            />
            {query && (
              <button type="button" aria-label="Clear asset search" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#9AA4B7] hover:bg-white hover:text-[#07133B]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-[#DFE6F1] bg-[#F8FAFD] p-1" aria-label="Delivery file view">
              <ViewButton active={view === "folder"} label="Folder view" icon={LayoutList} onClick={() => setView("folder")} />
              <ViewButton active={view === "flat"} label="Flat view" icon={Grid2X2} onClick={() => setView("flat")} />
            </div>
            <a
              href={`/api/delivery/${token}/download`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Download className="h-4 w-4" /> Download all (.zip)
            </a>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-medium text-[#8A95AA]">
          <span>{files.length} asset{files.length === 1 ? "" : "s"}</span>
          <span>{folderCount ? `${folderCount} folder${folderCount === 1 ? "" : "s"}` : "Flat delivery"}</span>
          <span>Secure individual and ZIP downloads</span>
        </div>
      </div>

      {showingSearch ? (
        <div className="p-3 sm:p-4">
          <p className="mb-3 text-[11px] font-bold text-[#526078]">{filteredFiles.length} search result{filteredFiles.length === 1 ? "" : "s"}</p>
          {filteredFiles.length ? (
            <FlatGrid token={token} files={filteredFiles} />
          ) : (
            <EmptyAssets title="No matching assets" detail="Try another filename or folder name." />
          )}
        </div>
      ) : view === "flat" ? (
        <div className="p-3 sm:p-4"><FlatGrid token={token} files={preparedFiles} /></div>
      ) : (
        <div>
          <nav className="flex min-h-12 flex-wrap items-center gap-1 border-b border-[#E4EAF3] bg-white px-4 py-2 text-xs" aria-label="Folder path">
            <button type="button" onClick={() => setCurrentPath("")} className={`rounded-lg px-2.5 py-1.5 font-bold ${currentPath ? "text-[#0A4FE8] hover:bg-blue-50" : "text-[#07133B]"}`}>
              Delivery files
            </button>
            {breadcrumbs.map((segment, index) => (
              <span key={`${segment}-${index}`} className="inline-flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[#AAB3C3]" />
                <button type="button" onClick={() => openBreadcrumb(index)} className={`rounded-lg px-2.5 py-1.5 font-semibold ${index === breadcrumbs.length - 1 ? "text-[#07133B]" : "text-[#0A4FE8] hover:bg-blue-50"}`}>
                  {segment}
                </button>
              </span>
            ))}
          </nav>

          <div className="p-3 sm:p-4">
            {childFolders.length === 0 && currentFiles.length === 0 ? (
              <EmptyAssets title="This folder is empty" detail="No downloadable assets are available here." />
            ) : (
              <div className="space-y-4">
                {childFolders.length > 0 && (
                  <div>
                    <p className="mb-2 px-1 text-[10px] font-semibold text-[#8A95AA]">Folders</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {childFolders.map((folder) => {
                        const assetCount = folderAssetCounts.get(folder) || 0;
                        return (
                          <button key={folder} type="button" onClick={() => setCurrentPath(folder)} className="group flex items-center gap-3 rounded-xl border border-[#DFE6F1] bg-white p-3 text-left transition hover:border-blue-200 hover:shadow-sm">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Folder className="h-5 w-5 fill-blue-100" /></span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-[#07133B]">{baseName(folder)}</span><span className="mt-1 block text-[10px] text-[#8A95AA]">{assetCount} asset{assetCount === 1 ? "" : "s"}</span></span>
                            <ChevronRight className="h-4 w-4 text-[#AAB3C3] group-hover:text-[#0A4FE8]" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {currentFiles.length > 0 && (
                  <div>
                    <p className="mb-2 px-1 text-[10px] font-semibold text-[#8A95AA]">Assets</p>
                    <div className="overflow-hidden rounded-xl border border-[#DFE6F1] bg-white">
                      {currentFiles.map((file) => <AssetRow key={file.id} token={token} file={file} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!currentPath && rootFolderCount === 0 && currentFiles.length > 0 && <p className="mt-3 text-center text-[10px] text-[#9AA4B7]">This delivery was uploaded as a flat asset collection.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function ViewButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof LayoutList; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition ${active ? "bg-white text-[#0A4FE8] shadow-sm" : "text-[#7B859B] hover:text-[#07133B]"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function FlatGrid({ token, files }: { token: string; files: Array<PublicDeliveryFile & { path: string }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => <AssetCard key={file.id} token={token} file={file} />)}
    </div>
  );
}

function AssetPreview({ token, file, compact = false }: { token: string; file: PublicDeliveryFile; compact?: boolean }) {
  const Icon = fileIcon(file);
  const previewUrl = `/api/delivery/${token}/files/${file.id}?preview=1&v=${file.preview_version}`;
  if (file.file_kind === "image") {
    return <LazyPreviewImage src={previewUrl} compact={compact} />;
  }
  return <span className="grid h-full w-full place-items-center bg-[#F1F5FA] text-[#0A4FE8]"><Icon className={compact ? "h-5 w-5" : "h-9 w-9"} /></span>;
}

function LazyPreviewImage({ src, compact }: { src: string; compact: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || shouldLoad) return;
    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <span ref={containerRef} className="relative block h-full w-full overflow-hidden bg-[#EDF2F8]">
      {!loaded && !failed && <span className="absolute inset-0 animate-pulse bg-[#EDF2F8]" />}
      {shouldLoad && !failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full bg-white object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"} ${compact ? "rounded-lg" : "group-hover:scale-[1.02]"}`}
        />
      )}
      {failed && <span className="absolute inset-0 grid place-items-center text-[#0A4FE8]"><ImageIcon className={compact ? "h-5 w-5" : "h-9 w-9"} /></span>}
    </span>
  );
}

function AssetCard({ token, file }: { token: string; file: PublicDeliveryFile & { path: string } }) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-[#DFE6F1] bg-white transition hover:border-blue-200 hover:shadow-[0_12px_30px_rgba(15,40,90,0.08)]">
      <a href={`/api/delivery/${token}/files/${file.id}`} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden border-b border-[#E8EDF5]" aria-label={`Preview ${file.file_name}`}>
        <AssetPreview token={token} file={file} />
      </a>
      <div className="flex items-center gap-3 p-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-[#07133B]" title={file.file_name}>{file.file_name}</span>
          <span className="mt-1 block truncate text-[10px] text-[#8A95AA]" title={file.path}>{file.path.includes("/") ? parentPath(file.path) : "Delivery root"} · {formatBytes(file.file_size)}</span>
        </span>
        <a href={`/api/delivery/${token}/files/${file.id}?download=1`} aria-label={`Download ${file.file_name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8] transition hover:bg-[#0A4FE8] hover:text-white">
          <Download className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

function AssetRow({ token, file }: { token: string; file: PublicDeliveryFile & { path: string } }) {
  return (
    <div className="group flex items-center gap-3 border-b border-[#EDF1F6] px-3 py-2.5 last:border-0 hover:bg-blue-50/40">
      <a href={`/api/delivery/${token}/files/${file.id}`} target="_blank" rel="noopener noreferrer" className="h-11 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E4EAF3]" aria-label={`Preview ${file.file_name}`}>
        <AssetPreview token={token} file={file} compact />
      </a>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-[#07133B]">{file.file_name}</span><span className="mt-1 block text-[10px] text-[#8A95AA]">{formatBytes(file.file_size)}</span></span>
      <a href={`/api/delivery/${token}/files/${file.id}?download=1`} aria-label={`Download ${file.file_name}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#DFE6F1] bg-white px-3 text-[10px] font-bold text-[#0A4FE8] transition hover:border-blue-200 hover:bg-blue-50">
        <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Download</span>
      </a>
    </div>
  );
}

function EmptyAssets({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#D6DFED] bg-white px-5 py-10 text-center">
      <FolderOpen className="mx-auto h-8 w-8 text-[#C1CAD8]" />
      <p className="mt-3 text-xs font-bold text-[#07133B]">{title}</p>
      <p className="mt-1 text-[11px] text-[#8A95AA]">{detail}</p>
    </div>
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "File";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
