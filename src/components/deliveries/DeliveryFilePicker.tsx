"use client";

import { DragEvent, useId, useMemo, useState, type InputHTMLAttributes } from "react";
import { AlertTriangle, FileArchive, FileText, FolderOpen, FolderUp, Plus, Upload, X } from "lucide-react";
import {
  DELIVERY_FILE_ACCEPT,
  deliveryFileRelativePath,
  MAX_DELIVERY_BATCH_BYTES,
  MAX_DELIVERY_FILES,
  screenDeliveryFiles,
  type ExcludedDeliveryFile,
} from "@/lib/client-deliveries";

interface DeliveryFilePickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
  compact?: boolean;
}

function fileKey(file: File) {
  return `${deliveryFileRelativePath(file)}:${file.size}:${file.lastModified}`;
}

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function DeliveryFilePicker({
  files,
  onChange,
  label = "Upload files or ZIP bundles",
  compact = false,
}: DeliveryFilePickerProps) {
  const inputId = useId();
  const folderInputId = useId();
  const [error, setError] = useState("");
  // A selection that contains files we cannot deliver waits here until the
  // sender either proceeds without them or cancels the whole selection.
  const [review, setReview] = useState<{ accepted: File[]; excluded: ExcludedDeliveryFile[] } | null>(null);
  const folderCount = useMemo(() => {
    const roots = new Set(
      files
        .map(deliveryFileRelativePath)
        .filter((path) => path.includes("/"))
        .map((path) => path.split("/")[0]),
    );
    return roots.size;
  }, [files]);

  /** Adds screened files to the selection, enforcing the count and size caps. */
  function commit(accepted: File[]) {
    const existing = new Set(files.map(fileKey));
    const unique = accepted.filter((file) => !existing.has(fileKey(file)));
    const next = [...files, ...unique];
    if (next.length > MAX_DELIVERY_FILES) {
      setError(`Add up to ${MAX_DELIVERY_FILES} assets to one delivery. Use a ZIP for larger folders.`);
      return;
    }
    if (next.reduce((total, file) => total + file.size, 0) > MAX_DELIVERY_BATCH_BYTES) {
      setError("The combined selection must be 100MB or less. Use a compressed ZIP or Google Drive link for larger handovers.");
      return;
    }
    onChange(next);
  }

  function addFiles(incoming: File[]) {
    setError("");
    const screened = screenDeliveryFiles(incoming);
    // Nothing unwanted: go straight in, exactly as before.
    if (!screened.excluded.length) {
      commit(screened.accepted);
      return;
    }
    // Otherwise show the sender what would be left out and let them decide.
    setReview(screened);
  }

  function proceedWithoutExcluded() {
    if (!review) return;
    const accepted = review.accepted;
    setReview(null);
    if (accepted.length) commit(accepted);
    else setError("None of the selected files can be delivered.");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className={compact ? "text-[11px]" : "text-xs"}>
      <p className="font-semibold text-gray-600">{label}</p>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="mt-1.5 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Upload className="h-4 w-4 text-[#0A4FE8]" />
          <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 font-bold text-[#0A4FE8] shadow-sm transition hover:bg-blue-50">
            <Plus className="h-3.5 w-3.5" /> Add files
          </label>
          <input
            id={inputId}
            type="file"
            multiple
            accept={DELIVERY_FILE_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              addFiles(Array.from(event.target.files || []));
              event.target.value = "";
            }}
          />
          <label htmlFor={folderInputId} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 font-bold text-[#0A4FE8] shadow-sm transition hover:bg-blue-50">
            <FolderUp className="h-3.5 w-3.5" /> Upload folder
          </label>
          <input
            id={folderInputId}
            type="file"
            multiple
            accept={DELIVERY_FILE_ACCEPT}
            className="sr-only"
            {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)}
            onChange={(event) => {
              addFiles(Array.from(event.target.files || []));
              event.target.value = "";
            }}
          />
          <span className="text-[10px] text-gray-500">Upload individual assets, a complete folder, or a ZIP bundle.</span>
        </div>

        {review && (
          <div role="alertdialog" aria-label="Files that will not be delivered" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {review.excluded.length} file{review.excluded.length === 1 ? "" : "s"} will be left out of this delivery
            </p>
            <p className="mt-1 text-[10px] text-amber-700">
              {review.accepted.length
                ? `${review.accepted.length} other file${review.accepted.length === 1 ? "" : "s"} will be added. Nothing is uploaded until you proceed.`
                : "None of the selected files can be delivered."}
            </p>
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
              {review.excluded.map(({ path, reason }) => (
                <li key={path} className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-[11px] font-medium text-gray-700" title={path}>{path}</span>
                  <span className="shrink-0 text-right text-[10px] text-amber-700">{reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {review.accepted.length > 0 && (
                <button type="button" onClick={proceedWithoutExcluded} className="rounded-lg bg-[#0A4FE8] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#083EC0]">
                  Proceed without {review.excluded.length === 1 ? "this file" : "these files"}
                </button>
              )}
              <button type="button" onClick={() => setReview(null)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-gray-600 hover:bg-gray-50">
                Cancel selection
              </button>
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500">
              <span>{files.length} asset{files.length === 1 ? "" : "s"} selected{folderCount ? ` from ${folderCount} folder${folderCount === 1 ? "" : "s"}` : ""}</span>
              <button type="button" onClick={() => onChange([])} className="text-rose-600 hover:underline">Clear all</button>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {files.map((file) => {
                const archive = file.name.toLowerCase().endsWith(".zip");
                const relativePath = deliveryFileRelativePath(file);
                const inFolder = relativePath.includes("/");
                const Icon = archive ? FileArchive : inFolder ? FolderOpen : FileText;
                return (
                  <div key={fileKey(file)} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-2.5 py-2">
                    <Icon className="h-4 w-4 shrink-0 text-[#0A4FE8]" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-700" title={relativePath}>{relativePath}</span>
                    <span className="shrink-0 text-[10px] text-gray-400">{fileSize(file.size)}</span>
                    <button type="button" onClick={() => onChange(files.filter((candidate) => fileKey(candidate) !== fileKey(file)))} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${file.name}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-[11px] font-medium text-rose-600">{error}</p>}
      <p className="mt-1 text-[10px] text-gray-400">Folder structure is preserved. Up to {MAX_DELIVERY_FILES} assets, 50MB each and 100MB combined per submission. Files upload in retryable chunks of up to 48MB.</p>
    </div>
  );
}
