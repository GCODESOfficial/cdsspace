"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { appAlert } from "@/lib/app-notify";

interface Props {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  /** "image" → PNG/SVG/JPG/WEBP, "video" → MP4/WEBM/MOV, or a custom accept string. */
  accept?: "image" | "video" | string;
  folder?: string;
  className?: string;
}

const ACCEPT_MAP: Record<string, string> = {
  image: "image/png,image/svg+xml,image/jpeg,image/webp",
  video: "video/mp4,video/webm,video/quicktime",
};

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12.5px] outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100";

/**
 * URL field with an inline upload option. Type/paste a URL, or click Upload to
 * pick a file - it uploads via /api/admin/upload and fills in the public URL.
 */
export function AssetUrlField({ label, value, onChange, placeholder, accept = "image", folder, className }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const acceptAttr = ACCEPT_MAP[accept] ?? accept;
  const isImage = accept === "image" || acceptAttr.includes("image/");
  const showPreview = isImage && !!value;

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (folder) fd.append("folder", folder);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      onChange(json.url);
    } catch (e) {
      await appAlert({ title: "Upload", message: e instanceof Error ? e.message : "Upload failed.", kind: "error" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <label className={`block ${className || ""}`}>
      {label && <span className="mb-1 block text-[12px] font-semibold text-[#0D1B39]">{label}</span>}
      <div className="flex items-center gap-2">
        {showPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 bg-white object-contain" />
        )}
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || "https://…"}
            className={`${inputCls} pr-9`}
          />
          {value && (
            <button type="button" onClick={() => onChange("")} title="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 transition hover:border-[#0A4FE8] hover:text-[#0A4FE8] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "Uploading" : "Upload"}
        </button>
      </div>
      <input ref={fileRef} type="file" accept={acceptAttr} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </label>
  );
}
