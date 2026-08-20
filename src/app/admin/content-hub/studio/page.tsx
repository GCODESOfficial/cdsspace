"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, PackagePlus, Clapperboard, Plus, Scissors } from "lucide-react";
import { appAlert } from "@/lib/app-notify";
import ContentHubShell from "@/components/content-hub/ContentHubShell";
import { CLIP_COUNTS, CLIP_TYPES, type MediaKind } from "@/lib/content-hub/shared";

interface Attachment { url: string; kind: MediaKind; file_name: string | null; mime_type: string | null; size_bytes: number | null }
interface ClipJob { id: string; source_url: string; requested_clips: number; clip_types: string[]; status: string; created_at: string; note: string | null }

const BRAND_PRESETS = ["Logo", "Watermark", "Intro", "Outro", "Fonts", "Colors", "Brand Identity"];

export default function BsdStudioPage() {
  const [video, setVideo] = useState<Attachment | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pkg, setPkg] = useState<Record<string, unknown> | null>(null);

  // clip repurposing
  const [clipVideo, setClipVideo] = useState<Attachment | null>(null);
  const [clipCount, setClipCount] = useState(5);
  const [clipTypes, setClipTypes] = useState<string[]>(["highlight", "quote", "key_lesson"]);
  const [branding, setBranding] = useState<string[]>(["Logo", "Watermark", "Outro"]);
  const [jobs, setJobs] = useState<ClipJob[]>([]);

  const videoRef = useRef<HTMLInputElement>(null);
  const clipRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadJobs(); }, []);
  async function loadJobs() {
    const res = await fetch("/api/admin/content-hub/clips", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setJobs(json.jobs);
  }

  async function upload(file: File): Promise<Attachment | null> {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/admin/content-hub/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json.ok) { await appAlert({ title: "Upload", message: json.error || "Upload failed.", kind: "error" }); return null; }
    return { url: json.url, kind: json.kind, file_name: json.file_name, mime_type: json.mime_type, size_bytes: json.size_bytes };
  }

  async function generatePackage() {
    if (!note.trim()) return appAlert({ title: "BSD", message: "Describe what the BSD video covers.", kind: "error" });
    setBusy("package");
    try {
      const res = await fetch("/api/admin/content-hub/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bsd_package", note, videoUrl: video?.url }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed.");
      setPkg(json.result);
    } catch (e) { await appAlert({ title: "BSD", message: e instanceof Error ? e.message : "Failed.", kind: "error" }); }
    finally { setBusy(null); }
  }

  async function saveAsContent(title: string, body: string) {
    const res = await fetch("/api/admin/content-hub", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, source: "bsd", content_type: "BSD", status: "draft", media: video ? [video] : [] }),
    });
    if ((await res.json()).ok) await appAlert({ title: "Saved", message: "Saved to library as a draft.", kind: "success" });
  }

  async function queueClipJob() {
    if (!clipVideo) return appAlert({ title: "Clips", message: "Upload a long video first.", kind: "error" });
    setBusy("clips");
    try {
      const res = await fetch("/api/admin/content-hub/clips", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: clipVideo.url, requested_clips: clipCount, clip_types: clipTypes, branding: { presets: branding } }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed.");
      await appAlert({ title: "Queued", message: `Clip job queued for ${clipCount} clips. CDS Space branding will be applied during rendering.`, kind: "success" });
      loadJobs();
    } catch (e) { await appAlert({ title: "Clips", message: e instanceof Error ? e.message : "Failed.", kind: "error" }); }
    finally { setBusy(null); }
  }

  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <ContentHubShell title="BSD Studio" subtitle="Turn BSD videos into a full content package, and repurpose long videos into short branded clips.">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* BSD video → package */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#0D1B39]"><Clapperboard className="h-4 w-4 text-[#0A4FE8]" /> BSD Video → Posts</h2>
          <p className="mt-1 text-[12.5px] text-gray-500">AI drafts LinkedIn, Facebook, Instagram, an X thread, summary, key lessons and quote cards.</p>

          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy("vup"); const a = await upload(f); setBusy(null); if (a) setVideo(a); }} />
          <button onClick={() => videoRef.current?.click()} className="mt-3 flex h-24 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-[13px] font-semibold text-gray-500 hover:border-blue-300 hover:bg-blue-50/40">
            {busy === "vup" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}{video ? "Replace video" : "Upload BSD video (optional)"}
          </button>
          {video && <p className="mt-2 truncate text-[12px] text-gray-500">{video.file_name}</p>}

          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What did this BSD cover? (topic, key points, speaker)..." className="mt-3 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-[#0D1B39] outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
          <button onClick={generatePackage} disabled={busy === "package"} className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13.5px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">
            {busy === "package" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />} Generate package
          </button>

          {pkg && (
            <div className="mt-4 space-y-2">
              {([
                ["LinkedIn", pkg.linkedin], ["Facebook", pkg.facebook], ["Instagram", pkg.instagram], ["Summary", pkg.summary],
              ] as [string, unknown][]).filter(([, v]) => v).map(([label, value]) => (
                <PackageBlock key={label} label={label} text={String(value)} onSave={() => saveAsContent(`BSD · ${label}`, String(value))} />
              ))}
              {Array.isArray(pkg.x_thread) && (
                <PackageBlock label="X Thread" text={(pkg.x_thread as string[]).join("\n\n")} onSave={() => saveAsContent("BSD · X Thread", (pkg.x_thread as string[]).join("\n\n"))} />
              )}
              {Array.isArray(pkg.key_lessons) && (
                <PackageBlock label="Key Lessons" text={(pkg.key_lessons as string[]).map((l) => `• ${l}`).join("\n")} onSave={() => saveAsContent("BSD · Key Lessons", (pkg.key_lessons as string[]).map((l) => `• ${l}`).join("\n"))} />
              )}
              {Array.isArray(pkg.quote_cards) && (
                <PackageBlock label="Quote Cards" text={(pkg.quote_cards as string[]).map((q) => `"${q}"`).join("\n\n")} onSave={() => saveAsContent("BSD · Quote Cards", (pkg.quote_cards as string[]).map((q) => `"${q}"`).join("\n\n"))} />
              )}
            </div>
          )}
        </section>

        {/* AI clip repurposing */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#0D1B39]"><Scissors className="h-4 w-4 text-[#0A4FE8]" /> AI Video Repurposing</h2>
          <p className="mt-1 text-[12.5px] text-gray-500">Cut one long video into short clips with CDS Space branding applied.</p>

          <input ref={clipRef} type="file" accept="video/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy("cup"); const a = await upload(f); setBusy(null); if (a) setClipVideo(a); }} />
          <button onClick={() => clipRef.current?.click()} className="mt-3 flex h-24 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-[13px] font-semibold text-gray-500 hover:border-blue-300 hover:bg-blue-50/40">
            {busy === "cup" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}{clipVideo ? "Replace long video" : "Upload 1 long video"}
          </button>
          {clipVideo && <p className="mt-2 truncate text-[12px] text-gray-500">{clipVideo.file_name}</p>}

          <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Number of clips</p>
          <div className="flex gap-2">
            {CLIP_COUNTS.map((n) => (
              <button key={n} onClick={() => setClipCount(n)} className={`flex-1 rounded-xl border py-2 text-[13px] font-bold transition ${clipCount === n ? "border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]" : "border-gray-200 text-gray-500 hover:border-blue-200"}`}>{n} clips</button>
            ))}
          </div>

          <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Clip types</p>
          <div className="flex flex-wrap gap-2">
            {CLIP_TYPES.map((t) => (
              <button key={t.value} onClick={() => setClipTypes(toggle(clipTypes, t.value))} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${clipTypes.includes(t.value) ? "bg-[#0A4FE8] text-white" : "bg-gray-100 text-gray-600 hover:bg-blue-50"}`}>{t.label}</button>
            ))}
          </div>

          <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">CDS Space branding presets</p>
          <div className="flex flex-wrap gap-2">
            {BRAND_PRESETS.map((b) => (
              <button key={b} onClick={() => setBranding(toggle(branding, b))} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${branding.includes(b) ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-violet-50"}`}>{b}</button>
            ))}
          </div>

          <button onClick={queueClipJob} disabled={busy === "clips"} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13.5px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">
            {busy === "clips" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />} Queue clip job
          </button>

          <p className="mt-2 text-[11px] text-gray-400">Rendering runs in the background; clips appear here when ready.</p>

          {jobs.length > 0 && (
            <div className="mt-4 space-y-2">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-bold text-[#0D1B39]">{j.requested_clips} clips · {j.clip_types.join(", ") || "auto"}</p>
                    <p className="text-[11px] text-gray-400">{new Date(j.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${j.status === "done" ? "bg-emerald-50 text-emerald-700" : j.status === "failed" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>{j.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ContentHubShell>
  );
}

function PackageBlock({ label, text, onSave }: { label: string; text: string; onSave: () => void }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-bold text-[#0D1B39]">{label}</span>
        <button onClick={onSave} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#0A4FE8] hover:underline"><Plus className="h-3.5 w-3.5" /> Save to library</button>
      </div>
      <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-6 text-[#0D1B39]">{text}</div>
    </div>
  );
}
