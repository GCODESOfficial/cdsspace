"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Film, Loader2, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { appConfirm } from "@/lib/app-notify";
import { TutorialVideoPlayer, type TutorialPlayerItem } from "@/components/tutorials/TutorialVideoPlayer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TutorialTargetPicker } from "@/components/admin/tutorials/TutorialTargetPicker";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { tutorialTargetLabel } from "@/lib/tutorial-targets";
import {
  beginUpload,
  clearPendingUpload,
  discardUpload,
  finishUpload,
  formatBytes,
  formatDuration,
  readPendingUpload,
  uploadFileInChunks,
  uploadStatus,
  writePendingUpload,
  type PendingUpload,
  type UploadProgress,
} from "@/lib/tutorial-upload-client";

type Tutorial = TutorialPlayerItem & { status: "draft" | "published" | "archived"; sortOrder: number; updatedAt: string; processingStatus: "queued" | "processing" | "ready" | "failed"; processingStage?: "queued" | "scanning" | "preparing" | "transcribing" | "translating" | "ready" | "failed"; processingProgress?: number; processingError?: string | null; sourceLanguageCode: string; publicToken?: string };

/** What each backend stage is called on screen, in the order they happen. */
const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  scanning: "Scanning for viruses",
  preparing: "Preparing the video",
  transcribing: "Transcribing the audio",
  translating: "Translating",
  ready: "Ready",
  failed: "Failed",
};

/** "Translating 43%" while a stage can count its work, just its name otherwise. */
function stageText(item: { processingStage?: string; processingStatus: string; processingProgress?: number }) {
  const stage = item.processingStage || (item.processingStatus === "ready" ? "ready" : "queued");
  const label = STAGE_LABELS[stage] || stage;
  const percent = Number(item.processingProgress || 0);
  return stage === "translating" && percent > 0 ? `${label} ${percent}%` : label;
}
const TOOLS = [
  ["official-letterhead", "Create letterhead"], ["create-studio", "Create Studio"], ["cdrive", "cDrive"], ["chat", "Chat"], ["cmeet", "cMeet"],
  ["brand-brief", "Brand brief"], ["brand-identity", "Brand identity"], ["banners", "Banners"], ["merch", "Merch"], ["invoices", "Invoices"],
] as const;
const LANGUAGES = [["en", "English"], ["fr", "French"], ["es", "Spanish"], ["pt", "Portuguese"], ["de", "German"], ["ar", "Arabic"], ["zh", "Chinese"], ["ru", "Russian"]] as const;

export function AdminTutorialManager() {
  const [items, setItems] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Percentage of the video actually sent. Stays at 100 while the server scans
  // the finished upload, which is the slow part the old spinner never explained.
  const [progress, setProgress] = useState(0);
  const [transfer, setTransfer] = useState<UploadProgress | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<Tutorial | null>(null);
  const [editing, setEditing] = useState<Tutorial | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>(["official-letterhead"]);
  const [languageName, setLanguageName] = useState("English");
  const formRef = useRef<HTMLFormElement | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const response = await fetch("/api/admin/tutorials", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!silent) setLoading(false);
    if (!response.ok) { setError(payload.error || "Tutorials could not be loaded."); return; }
    setItems(payload.tutorials || []);
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const saved = readPendingUpload();
    if (!saved) return;
    // Confirm the server still holds the parts before offering to carry on.
    void uploadStatus(saved.uploadId).then((status) => {
      if (!status) { clearPendingUpload(); return; }
      setPending({ ...saved, receivedBytes: status.receivedBytes });
    });
  }, []);
  useEffect(() => {
    if (!items.some((item) => item.processingStatus === "queued" || item.processingStatus === "processing")) return;
    const timer = window.setInterval(() => void load(true), 8_000);
    return () => window.clearInterval(timer);
  }, [items]);

  const filtered = useMemo(() => items.filter((item) => `${item.title} ${item.description} ${item.toolSlug}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tags.length) { setError("Choose at least one tool, module or page this tutorial covers."); return; }
    const form = new FormData(event.currentTarget);
    const file = form.get("video");
    if (!(file instanceof File) || !file.size) { setError("Choose a tutorial video."); return; }
    const language = LANGUAGES.find(([, name]) => name === languageName);
    const meta: Record<string, string> = {
      toolSlug: tags[0] || "official-letterhead",
      tags: JSON.stringify(tags),
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      status: String(form.get("status") || "published"),
      sortOrder: String(form.get("sortOrder") || "0"),
      languageCode: language?.[0] || "en",
      languageName: language?.[1] || languageName,
    };
    await runUpload(file, meta, null);
  }

  /**
   * Sends the video in parts. An upload that stops is kept, so it can be
   * carried on later instead of started again.
   */
  async function runUpload(file: File, meta: Record<string, string>, resume: PendingUpload | null) {
    setSaving(true); setError(null); setNotice(null); setProgress(resume ? Math.round((resume.receivedBytes / file.size) * 100) : 0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let uploadId = resume?.uploadId || "";
      let chunkSize = 4 * 1024 * 1024;
      let startAt = 0;
      if (resume) {
        const status = await uploadStatus(resume.uploadId);
        if (!status) throw new Error("That unfinished upload has expired. Start it again.");
        if (status.fileSize !== file.size || status.fileName !== file.name) {
          throw new Error("That is a different file. Choose the same video to carry on, or discard the unfinished upload.");
        }
        chunkSize = status.chunkSize;
        startAt = status.receivedBytes;
      } else {
        const begun = await beginUpload(file);
        uploadId = begun.uploadId;
        chunkSize = begun.chunkSize;
      }

      const record: PendingUpload = { uploadId, fileName: file.name, fileSize: file.size, receivedBytes: startAt, savedAt: Date.now(), meta };
      writePendingUpload(record);
      setPending(record);

      await uploadFileInChunks({
        file, uploadId, chunkSize, startAt, signal: controller.signal,
        onProgress: (value) => { setTransfer(value); setProgress(value.percent); },
        onChunkDone: (receivedBytes) => writePendingUpload({ ...record, receivedBytes }),
      });

      setTransfer(null);
      const payload = await finishUpload(uploadId, meta);
      clearPendingUpload();
      setPending(null);
      setResumeFile(null);
      setItems((payload.tutorials as Tutorial[]) || []);
      setNotice("Video uploaded. It is being compressed for streaming, then captions and seven translated audio tracks are generated automatically.");
      setShowForm(false); formRef.current?.reset(); setTags(["official-letterhead"]); setLanguageName("English");
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "Upload paused. It is saved, so you can carry on or discard it below."
        : error instanceof Error ? error.message : "The tutorial could not be uploaded.";
      setError(message);
      setPending(readPendingUpload());
    } finally {
      abortRef.current = null;
      setSaving(false);
      setProgress(0);
      setTransfer(null);
    }
  }

  async function dropPending() {
    if (!pending) return;
    await discardUpload(pending.uploadId);
    setPending(null);
    setResumeFile(null);
    setNotice("The unfinished upload was discarded.");
  }

  async function update(item: Tutorial, values: Partial<Tutorial>) {
    setError(null);
    const response = await fetch("/api/admin/tutorials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, title: item.title, description: item.description, toolSlug: item.toolSlug, status: item.status, sortOrder: item.sortOrder, ...values }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "The tutorial could not be updated."); return; }
    setItems(payload.tutorials || []);
  }

  async function remove(item: Tutorial) {
    if (!(await appConfirm(`Delete “${item.title}” from client tutorials?`))) return;
    const response = await fetch(`/api/admin/tutorials?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "The tutorial could not be deleted."); return; }
    setItems((current) => current.filter((tutorial) => tutorial.id !== item.id));
  }

  async function reprocess(item: Tutorial) {
    setError(null); setNotice(null);
    const response = await fetch("/api/admin/tutorials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action: "reprocess" }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Tutorial processing could not be restarted."); return; }
    setItems(payload.tutorials || []); setNotice("Caption and audio generation restarted.");
  }

  return (
    <div className="min-h-screen bg-[#F5F8FF] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-[12px] font-semibold text-[#0A4FE8]">Client learning centre</p><h1 className="mt-1 text-2xl font-semibold text-[#07133B] sm:text-3xl">Tutorials</h1><p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#667085]">Upload one secure tool-specific video. CDS Space automatically creates captions and translated audio in all eight supported languages.</p></div>
          <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-[#083EC0]">{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? "Close upload" : "Upload tutorial"}</button>
        </header>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</p>}
        {notice && <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800"><Check className="h-4 w-4" />{notice}</p>}
        {preview && <TutorialVideoPlayer tutorial={preview} onClose={() => setPreview(null)} />}

        {showForm && <form ref={formRef} onSubmit={submit} className="rounded-2xl border border-[#DCE5F5] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5"><h2 className="text-[16px] font-semibold text-[#07133B]">Upload tutorial video</h2><p className="mt-1 text-[11.5px] text-[#667085]">Choose the language spoken in the original recording. Captions and the other seven audio languages are generated automatically.</p></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TutorialTargetPicker value={tags} onChange={setTags} />
            <Field label="Original audio language"><select value={languageName} onChange={(event) => setLanguageName(event.target.value)} required className={inputClass}>{LANGUAGES.map(([code, name]) => <option key={code} value={name}>{name}</option>)}</select><span className="mt-1 block text-[10px] leading-4 text-gray-400">This tells CDS Space which viewers can use the original audio and which viewers need an AI-translated track.</span></Field>
            <Field label="Short title"><input name="title" maxLength={180} required placeholder="How to create and export a letterhead" className={inputClass} /></Field><Field label="Publishing"><select name="status" className={inputClass}><option value="published">Publish after processing</option><option value="draft">Save as draft</option></select></Field><Field label="Short description" wide><textarea name="description" maxLength={1200} rows={4} placeholder="What the client will learn from this video." className={`${inputClass} h-auto py-3`} /></Field>
            <Field label="Video file" wide><input name="video" type="file" accept="video/mp4,video/quicktime,video/webm,.m4v" required className={fileClass} /><span className="mt-1 block text-[10px] text-gray-400">MP4, MOV, M4V, or WebM · malware scanned · maximum 150MB</span></Field>
          </div>
          <button disabled={saving} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13px] font-semibold text-white hover:bg-[#083EC0] disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{saving ? (progress < 100 ? `Uploading ${progress}%` : "Scanning for viruses…") : "Upload and generate languages"}</button>
          {saving && (
            <div className="mt-3 max-w-md" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#E3EBFB]">
                <div className="h-full rounded-full bg-[#0A4FE8] transition-[width] duration-200" style={{ width: `${Math.max(2, progress)}%` }} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[#667085]">
                {progress < 100 ? (
                  <>
                    <span>
                      {transfer
                        ? `${formatBytes(transfer.sentBytes)} of ${formatBytes(transfer.totalBytes)} sent`
                        : `Uploading ${progress}%`}
                    </span>
                    {transfer && transfer.bytesPerSecond > 1024 && <span>{formatBytes(transfer.bytesPerSecond)}/s</span>}
                    {transfer && formatDuration(transfer.secondsRemaining) && <span>{formatDuration(transfer.secondsRemaining)}</span>}
                    <button
                      type="button"
                      onClick={() => abortRef.current?.abort()}
                      className="font-semibold text-[#0A4FE8] hover:underline"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <span>Upload complete. Scanning, compressing for streaming, then transcribing and translating into eight languages.</span>
                )}
              </div>
            </div>
          )}
        </form>}

        {pending && !saving && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <h2 className="text-[14px] font-semibold text-amber-900">Unfinished upload</h2>
            <p className="mt-1 text-[12px] leading-5 text-amber-900/80">
              {pending.fileName} stopped at {Math.round((pending.receivedBytes / Math.max(1, pending.fileSize)) * 100)}%
              ({formatBytes(pending.receivedBytes)} of {formatBytes(pending.fileSize)} already sent).
              Choose the same file to carry on from there, or discard it.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/x-m4v,video/webm"
                onChange={(event) => setResumeFile(event.target.files?.[0] || null)}
                className="max-w-full text-[11.5px] text-amber-900 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-900 file:px-3 file:py-2 file:text-[11.5px] file:font-semibold file:text-white"
              />
              <button
                type="button"
                disabled={!resumeFile}
                onClick={() => { if (resumeFile) void runUpload(resumeFile, pending.meta, pending); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 py-2 text-[11.5px] font-semibold text-white disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" /> Continue upload
              </button>
              <button
                type="button"
                onClick={() => void dropPending()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-[11.5px] font-semibold text-amber-900"
              >
                <Trash2 className="h-3.5 w-3.5" /> Discard
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-[#DCE5F5] bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[16px] font-semibold text-[#07133B]">Tutorial library</h2><p className="mt-1 text-[11.5px] text-[#667085]">{items.length} managed {items.length === 1 ? "tutorial" : "tutorials"}</p></div><div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tutorials or tools" className={`${inputClass} pl-10`} /></div></div>
          {loading ? <div className="grid min-h-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div> : filtered.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => <article key={item.id} className="rounded-2xl border border-[#DCE5F5] p-4">
              <button type="button" onClick={() => setPreview(item)} className="group grid aspect-video w-full place-items-center rounded-xl bg-[#07133B] text-white"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#0A4FE8] group-hover:scale-105"><Film className="h-5 w-5" /></span></button>
              <div className="mt-4 flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-[14px] font-semibold text-[#07133B]">{item.title}</h3><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#667085]">{item.description}</p></div><span className={`rounded-full px-2 py-1 text-[9.5px] font-semibold ${item.processingStatus === "failed" ? "bg-rose-50 text-rose-700" : item.processingStatus !== "ready" ? "bg-blue-50 text-[#0A4FE8]" : item.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.processingStatus === "ready" ? item.status : stageText(item)}</span></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{(item.tags?.length ? item.tags : [item.toolSlug]).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[9.5px] font-semibold text-slate-600">{tutorialTargetLabel(tag)}</span>)}</div>
              {item.processingStatus !== "ready" && item.processingStatus !== "failed" && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#E3EBFB]">
                    <div
                      className="h-full rounded-full bg-[#0A4FE8] transition-[width] duration-500"
                      style={{ width: `${Math.max(4, Number(item.processingProgress || 0))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-[#667085]">{stageText(item)}</p>
                </div>
              )}
              {item.publicToken && item.status === "published" && item.processingStatus === "ready" && (
                <div className="mt-3">
                  <UniversalShareButton
                    title={item.title}
                    text={item.description || `A CDS Space tutorial: ${item.title}`}
                    url={`/tutorial/${item.publicToken}`}
                    label="Share tutorial"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DCE5F5] px-3 text-[11px] font-semibold text-[#0A4FE8] hover:bg-[#F5F8FF]"
                  />
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">{item.media.map((media) => <span key={media.id} className="rounded-full bg-blue-50 px-2 py-1 text-[9.5px] font-semibold text-[#0A4FE8]">{media.languageName}{media.hasCaptions ? " · captions" : ""}</span>)}</div>
              {item.processingError && <p title={item.processingError} className="mt-3 line-clamp-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[10px] leading-4 text-rose-700">Automatic generation needs attention. You can retry it below.</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-3">
                {item.processingStatus === "failed" && <button type="button" onClick={() => void reprocess(item)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2 py-2 text-[10.5px] font-semibold text-[#0A4FE8]"><Loader2 className="h-3.5 w-3.5" />Retry</button>}
                <button type="button" onClick={() => { setEditing(item); setEditingTags(item.tags?.length ? item.tags : [item.toolSlug]); }} className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-2 text-[10.5px] font-semibold text-gray-600"><Pencil className="h-3.5 w-3.5" />Edit</button>
                <button type="button" onClick={() => void update(item, { status: item.status === "published" ? "draft" : "published" })} className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-2 text-[10.5px] font-semibold text-gray-600"><Check className="h-3.5 w-3.5" />{item.status === "published" ? "Unpublish" : "Publish"}</button>
                <button type="button" onClick={() => void remove(item)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[10.5px] font-semibold text-rose-700"><Trash2 className="h-3.5 w-3.5" />Delete</button>
              </div>
            </article>)}
          </div> : <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-[#DCE5F5] text-center"><div><BookOpen className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-2 text-[13px] font-semibold text-[#07133B]">No tutorials found</p></div></div>}
        </section>
        <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader><DialogTitle>Edit tutorial details</DialogTitle><DialogDescription>Update the client-facing title, description, tool placement, and publishing state.</DialogDescription></DialogHeader>
            {editing && <form className="mt-3 space-y-4" onSubmit={async (event) => {
              event.preventDefault();
              if (!editingTags.length) { setError("Choose at least one tool, module or page this tutorial covers."); return; }
              const form = new FormData(event.currentTarget);
              await update(editing, { title: String(form.get("title") || ""), description: String(form.get("description") || ""), toolSlug: editingTags[0], tags: editingTags, status: String(form.get("status") || "published") as Tutorial["status"] }); setEditing(null);
            }}>
              <Field label="Short title"><input name="title" defaultValue={editing.title} maxLength={180} required className={inputClass} /></Field>
              <TutorialTargetPicker value={editingTags} onChange={setEditingTags} />
              <Field label="Short description"><textarea name="description" defaultValue={editing.description} maxLength={1200} rows={4} className={`${inputClass} h-auto py-3`} /></Field>
              <Field label="Publishing"><select name="status" defaultValue={editing.status} className={inputClass}><option value="published">Published</option><option value="draft">Draft</option></select></Field>
              <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[12px] font-semibold text-white hover:bg-[#083EC0]"><Check className="h-4 w-4" />Save changes</button>
            </form>}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

const inputClass = "h-11 w-full rounded-xl border border-[#DCE5F5] bg-white px-3 text-[12px] text-[#07133B] outline-none focus:border-[#0A4FE8]";
const fileClass = "block w-full rounded-xl border border-dashed border-[#C9D7EF] bg-[#F8FAFD] px-3 py-2.5 text-[11px] file:mr-3 file:rounded-lg file:border-0 file:bg-[#0A4FE8] file:px-3 file:py-2 file:text-[10.5px] file:font-semibold file:text-white";
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={`block text-[11.5px] font-semibold text-[#344054] ${wide ? "lg:col-span-2" : ""}`}>{label}<span className="mt-1.5 block font-normal">{children}</span></label>; }
