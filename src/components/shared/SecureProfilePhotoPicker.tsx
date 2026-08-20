"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, ShieldCheck, UserRound } from "lucide-react";

export function SecureProfilePhotoPicker({ initialUrl, endpoint, name, onUploaded }: { initialUrl: string | null; endpoint: string; name: string; onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const upload = async (file: File) => {
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not upload your profile picture.");
      setPreview(payload.avatarUrl);
      onUploaded(payload.avatarUrl);
      setMessage("Profile picture updated securely.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload your profile picture.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-[14px] border border-blue-100 bg-blue-50/40 p-4 sm:flex-row sm:items-center">
      <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[18px] border border-white bg-white text-slate-300 shadow-sm">
        {preview ? <img src={preview} alt={`${name} profile`} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <UserRound className="h-8 w-8" />}
      </div>
      <div className="min-w-0 flex-1"><h3 className="text-[14px] font-semibold text-[#0D1B39]">Profile picture</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">Upload a JPG, PNG, WEBP or GIF up to 5MB. Google sign-in photos appear automatically until you replace them.</p><p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Images are decoded, scanned and rebuilt before storage.</p>{message && <p className={`mt-2 text-[11px] font-medium ${/updated/i.test(message) ? "text-emerald-700" : "text-red-600"}`}>{message}</p>}</div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-blue-200 bg-white px-4 text-[12px] font-semibold text-[#0A4FE8] shadow-sm disabled:opacity-50">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{uploading ? "Checking…" : preview ? "Change photo" : "Upload photo"}</button>
    </div>
  );
}
