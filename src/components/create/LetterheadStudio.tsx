"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Archive, Check, ClipboardPaste, Copy, Download, FileText, Loader2, LockKeyhole, Plus, Upload } from "lucide-react";
import { RichDocEditor } from "@/components/cdocs/rich-doc-editor";
import { appConfirm } from "@/lib/app-notify";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LetterheadExportSize } from "@/lib/letterhead-pdf";

type Letterhead = {
  id: string;
  title: string;
  bodyHtml: string;
  paperSize: "a4" | "legal";
  hasSecondPage: boolean;
  firstPageName: string | null;
  firstPageUrl: string | null;
  secondPageName: string | null;
  secondPageUrl: string | null;
  signatureName: string | null;
  signatureUrl: string | null;
  signatureX: number;
  signatureY: number;
  signatureWidth: number;
  signaturePage: "first" | "last";
  status: "draft" | "ready" | "archived";
  lastExportedAt: string | null;
  updatedAt: string;
};

type AssetKind = "firstPage" | "secondPage" | "signature";
type SaveState = "idle" | "saving" | "saved" | "error";
type WorkspaceKind = "client" | "team" | "admin";

function apiPath(path: string, workspaceKind: WorkspaceKind) {
  return `${path}${path.includes("?") ? "&" : "?"}workspace=${workspaceKind}`;
}

const ACCEPT = ".jpg,.jpeg,.png,.pdf,.svg,image/jpeg,image/png,image/svg+xml,application/pdf";

let previewRuntimePromise: Promise<{
  buildLetterheadPdf: typeof import("@/lib/letterhead-pdf").buildLetterheadPdf;
  pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
}> | null = null;

function loadPreviewRuntime() {
  if (!previewRuntimePromise) {
    previewRuntimePromise = Promise.all([
      import("@/lib/letterhead-pdf"),
      import("pdfjs-dist/legacy/build/pdf.mjs"),
    ]).then(([pdfModule, pdfjs]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return { buildLetterheadPdf: pdfModule.buildLetterheadPdf, pdfjs };
    });
  }
  return previewRuntimePromise;
}

function canvasObjectUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("The preview page could not be prepared."));
      else resolve(URL.createObjectURL(blob));
    }, "image/webp", 0.9);
  });
}

export function LetterheadStudio({ onBack, workspaceKind }: { onBack: () => void; workspaceKind: WorkspaceKind }) {
  const [items, setItems] = useState<Letterhead[]>([]);
  const [active, setActive] = useState<Letterhead | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<AssetKind | null>(null);
  const [refining, setRefining] = useState(false);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preparingExport, setPreparingExport] = useState(false);
  const [exportingSize, setExportingSize] = useState<LetterheadExportSize | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [originalPdfBytes, setOriginalPdfBytes] = useState<ArrayBuffer | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedId = useRef<string | null>(null);
  const signaturePreviewRef = useRef<HTMLDivElement | null>(null);
  const previewUrls = useRef<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(apiPath("/api/create/letterheads", workspaceKind), { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || "Letterheads could not be loaded."); return; }
    setItems(payload.letterheads || []);
  }, [workspaceKind]);

  useEffect(() => {
    void load();
    // Download and initialise the heavy renderer while the saved-document
    // library is being read, rather than after somebody opens a document.
    void loadPreviewRuntime();
  }, [load]);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
  }, []);

  function open(item: Letterhead) {
    loadedId.current = item.id;
    setActive(item);
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
    setPreviewPages([]);
    setError(null);
    setSaveState("idle");
  }

  async function create() {
    setCreating(true); setError(null);
    const response = await fetch(apiPath("/api/create/letterheads", workspaceKind), { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setCreating(false);
    if (!response.ok) { setError(payload.error || "The draft could not be created."); return; }
    setItems((current) => [payload.letterhead, ...current]);
    open(payload.letterhead);
  }

  const persist = useCallback(async (draft: Letterhead): Promise<boolean> => {
    setSaveState("saving");
    try {
      const response = await fetch(apiPath(`/api/create/letterheads/${draft.id}`, workspaceKind), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          bodyHtml: draft.bodyHtml,
          paperSize: draft.paperSize,
          hasSecondPage: draft.hasSecondPage,
          signatureX: draft.signatureX,
          signatureY: draft.signatureY,
          signatureWidth: draft.signatureWidth,
          signaturePage: draft.signaturePage,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setSaveState("error"); setError(payload.error || "Changes could not be saved."); return false; }
      setSaveState("saved");
      setItems((current) => current.map((item) => item.id === draft.id ? { ...item, updatedAt: payload.letterhead.updatedAt } : item));
      return true;
    } catch {
      setSaveState("error");
      setError("Changes could not be saved. Check your connection and try again.");
      return false;
    }
  }, []);

  useEffect(() => {
    if (!active || loadedId.current !== active.id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("idle");
    saveTimer.current = setTimeout(() => void persist(active), 850);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [active?.id, active?.title, active?.bodyHtml, active?.paperSize, active?.hasSecondPage, active?.signatureX, active?.signatureY, active?.signatureWidth, active?.signaturePage, persist]);

  function patch(values: Partial<Letterhead>) {
    setActive((current) => current ? { ...current, ...values } : current);
  }

  async function upload(kind: AssetKind, file: File) {
    if (!active) return;
    // Refused here too, so nobody waits for a large upload only to be told no.
    if (file.size > ASSET_MAX_BYTES) {
      setError(`${file.name || "That file"} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Letterheads and signatures must be 5MB or smaller.`);
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!(await persist(active))) return;
    setUploading(kind); setError(null);
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}/upload`, workspaceKind), { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    setUploading(null);
    if (!response.ok) { setError(payload.error || "The file could not be uploaded."); return; }
    setActive(payload.letterhead);
    setItems((current) => current.map((item) => item.id === active.id ? payload.letterhead : item));
  }

  async function duplicateLetterhead(source: Letterhead, { saveFirst = false }: { saveFirst?: boolean } = {}) {
    if (duplicatingId) return;
    if (saveFirst) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (!(await persist(source))) return;
    }
    setDuplicatingId(source.id);
    setError(null);
    try {
      const response = await fetch(apiPath(`/api/create/letterheads/${source.id}/duplicate`, workspaceKind), { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || "The letterhead could not be duplicated."); return; }
      setItems((current) => [payload.letterhead, ...current]);
      open(payload.letterhead);
    } catch {
      setError("The letterhead could not be duplicated. Check your connection and try again.");
    } finally {
      setDuplicatingId(null);
    }
  }

  async function archive() {
    if (!active || !(await appConfirm("Archive this letterhead document?"))) return;
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}`, workspaceKind), { method: "DELETE" });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); setError(payload.error || "The document could not be archived."); return; }
    setItems((current) => current.filter((item) => item.id !== active.id));
    setActive(null);
  }

  async function refine(mode: string) {
    if (!active) return;
    setRefining(true); setError(null);
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}/refine`, workspaceKind), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, bodyHtml: active.bodyHtml }),
    });
    const payload = await response.json().catch(() => ({}));
    setRefining(false);
    if (!response.ok) { setError(payload.error || "AI refinement could not be completed."); return; }
    patch({ bodyHtml: payload.bodyHtml });
  }

  async function openExportChoices() {
    if (!active) return;
    if (!active.firstPageUrl) { setError("Upload the first-page letterhead design before exporting."); return; }
    setError(null);
    setPreparingExport(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      if (!(await persist(active))) return;
      const { prepareLetterheadPdf } = await import("@/lib/letterhead-pdf");
      setOriginalPdfBytes(await prepareLetterheadPdf(active));
      setExportDialogOpen(true);
    } catch {
      setError("The PDF options could not be prepared. Please try again.");
    } finally {
      setPreparingExport(false);
    }
  }

  async function downloadExport(exportSize: LetterheadExportSize) {
    if (!active || !originalPdfBytes || exportingSize) return;
    setExportingSize(exportSize);
    setError(null);
    try {
      const { exportLetterheadToPdf } = await import("@/lib/letterhead-pdf");
      await exportLetterheadToPdf(active, exportSize, originalPdfBytes.slice(0));
      await fetch(apiPath(`/api/create/letterheads/${active.id}`, workspaceKind), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exported" }),
      });
      setItems((current) => current.map((item) => item.id === active.id ? { ...item, status: "ready", lastExportedAt: new Date().toISOString() } : item));
      setExportDialogOpen(false);
    } catch {
      setError("The selected PDF size could not be exported. Please try again.");
    } finally {
      setExportingSize(null);
    }
  }

  const previewSource = useMemo<Letterhead | null>(() => active ? {
    ...active,
    // Signature placement does not change pagination and is painted as an
    // interactive overlay. Excluding it prevents an expensive PDF rebuild on
    // every pointer movement while the user drags the signature.
    signatureUrl: null,
  } : null, [active?.id, active?.bodyHtml, active?.paperSize, active?.firstPageUrl, active?.secondPageUrl, active?.hasSecondPage]);

  useEffect(() => {
    if (!previewSource) {
      setPreviewPages([]);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewBusy(true);
      setPreviewError(null);
      const generatedUrls: string[] = [];
      let loadingTask: ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]> | null = null;
      try {
        const { buildLetterheadPdf, pdfjs } = await loadPreviewRuntime();

        // The preview is rendered from the same jsPDF document used by the
        // download. Signature stays as an interactive overlay, but its
        // percentage coordinates map to the identical page dimensions.
        const doc = await buildLetterheadPdf(previewSource, { includeSignature: false });
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")) });
        const pdf = await loadingTask.promise;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) break;
          const page = await pdf.getPage(pageNumber);
          // This is comfortably sharper than the largest on-screen preview,
          // without producing multi-megabyte base64 strings for every page.
          const viewport = page.getViewport({ scale: 1.25 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("This browser cannot render the PDF preview.");
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const objectUrl = await canvasObjectUrl(canvas);
          generatedUrls.push(objectUrl);
          page.cleanup();
          canvas.width = 1;
          canvas.height = 1;
          if (!cancelled) {
            if (generatedUrls.length === 1) {
              const previousUrls = previewUrls.current;
              previewUrls.current = [...generatedUrls];
              setPreviewPages([...generatedUrls]);
              window.setTimeout(() => previousUrls.forEach((url) => URL.revokeObjectURL(url)), 0);
            } else {
              previewUrls.current = [...generatedUrls];
              setPreviewPages([...generatedUrls]);
            }
          }
        }
        if (cancelled) generatedUrls.filter((url) => !previewUrls.current.includes(url)).forEach((url) => URL.revokeObjectURL(url));
      } catch (previewFailure) {
        console.error("[letterhead preview]", previewFailure);
        generatedUrls.filter((url) => !previewUrls.current.includes(url)).forEach((url) => URL.revokeObjectURL(url));
        if (!cancelled) setPreviewError("The exact PDF preview could not be rendered in this browser. Your document remains saved.");
      } finally {
        await loadingTask?.destroy().catch(() => undefined);
        if (!cancelled) setPreviewBusy(false);
      }
    }, previewUrls.current.length ? 260 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [previewSource]);

  if (loading) return <div className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>;

  if (!active) {
    return (
      <div className="space-y-5">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"><ArrowLeft className="h-3.5 w-3.5" />Back to tools</button>
        <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-bold text-[#07133B]">Official letterhead documents</h2><p className="mt-1 text-[13px] text-gray-600">Create, reuse, duplicate, sign, and export corporate letters with the cDocs editor.</p></div>
          <button onClick={create} disabled={creating} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}New letterhead</button>
        </div>
        <PrivacyNotice />
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</p>}
        {items.length ? <section>
          <div className="mb-3">
            <h2 className="text-[15px] font-bold text-[#07133B]">Saved letterheads</h2>
            <p className="mt-0.5 text-[12px] text-gray-500">Open a previous document or duplicate it as the starting point for a new letter.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
              <button type="button" onClick={() => open(item)} className="block w-full text-left">
                <div className="relative aspect-[16/6] overflow-hidden border-b border-gray-100 bg-[#F3F6FB]">
                  {item.firstPageUrl ? (
                    <img src={item.firstPageUrl} alt={`${item.title} letterhead preview`} loading="lazy" decoding="async" className="absolute inset-x-0 top-0 h-auto w-full bg-white" />
                  ) : (
                    <div className="grid h-full place-items-center text-center"><span><FileText className="mx-auto h-7 w-7 text-blue-300" /><span className="mt-1.5 block text-[10px] font-semibold text-gray-400">Add letterhead artwork</span></span></div>
                  )}
                  <span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-semibold capitalize shadow-sm ${item.status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.status}</span>
                </div>
                <div className="px-4 pt-3">
                  <h3 className="truncate text-[14px] font-bold text-[#07133B]">{item.title}</h3>
                  <p className="mt-1 text-[11px] text-gray-400">{item.paperSize.toUpperCase()} · Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
                </div>
              </button>
              <div className="mx-4 mt-4 flex gap-2 border-t border-gray-100 pb-4 pt-3">
                <button type="button" onClick={() => open(item)} className="flex-1 rounded-lg bg-[#0A4FE8] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#083EC0]">Open</button>
                <button type="button" disabled={Boolean(duplicatingId)} onClick={() => void duplicateLetterhead(item)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-[#0A4FE8] hover:bg-blue-100 disabled:opacity-60">
                  {duplicatingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}Duplicate
                </button>
              </div>
            </article>
          ))}</div>
        </section> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-gray-200 bg-white text-center"><div><FileText className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-3 text-sm font-semibold text-[#07133B]">No saved letterheads yet</p><p className="mt-1 text-[12px] text-gray-400">Create the first reusable corporate document.</p></div></div>}
      </div>
    );
  }

  const previewAspect = active.paperSize === "legal" ? 215.9 / 355.6 : 210 / 297;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={async () => { if (saveTimer.current) clearTimeout(saveTimer.current); if (await persist(active)) setActive(null); }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50">Back to documents</button>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[11px] ${saveState === "error" ? "text-rose-600" : "text-gray-400"}`}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "Autosave on"}</span>
          <button onClick={() => { if (saveTimer.current) clearTimeout(saveTimer.current); void persist(active); }} disabled={saveState === "saving"} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-100 disabled:opacity-60">{saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Save letterhead</button>
          <button onClick={() => void duplicateLetterhead(active, { saveFirst: true })} disabled={Boolean(duplicatingId)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-60">{duplicatingId === active.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}Duplicate</button>
          <button onClick={archive} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"><Archive className="h-3.5 w-3.5" />Archive</button>
          <button onClick={openExportChoices} disabled={preparingExport || Boolean(exportingSize)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#083EC0] disabled:cursor-wait disabled:opacity-65">{preparingExport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{preparingExport ? "Preparing…" : "Export PDF"}</button>
        </div>
      </div>
      <PrivacyNotice />
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
        <section className="min-w-0 space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
            <label className="text-[12px] font-semibold text-gray-600">Document title<input value={active.title} onChange={(event) => patch({ title: event.target.value })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" /></label>
            <label className="text-[12px] font-semibold text-gray-600">Paper size<select value={active.paperSize} onChange={(event) => patch({ paperSize: event.target.value === "legal" ? "legal" : "a4" })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] outline-none"><option value="a4">A4 portrait</option><option value="legal">Legal portrait</option></select></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AssetUpload label="First-page letterhead design" name={active.firstPageName} kind="firstPage" busy={uploading === "firstPage"} onFile={upload} />
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600"><input type="checkbox" checked={active.hasSecondPage} onChange={(event) => patch({ hasSecondPage: event.target.checked })} className="h-4 w-4 rounded border-gray-300 text-[#0A4FE8]" />Use a separate design from page two onward</label>
              {active.hasSecondPage && <AssetUpload label="Page two and later design" name={active.secondPageName} kind="secondPage" busy={uploading === "secondPage"} onFile={upload} />}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-2.5">
            <span className="mr-auto text-[11px] font-semibold text-gray-500">Refine the current document with AI</span>
            {[["improve", "Improve"], ["formalize", "Make formal"], ["concise", "Make concise"], ["proofread", "Proofread"]].map(([mode, label]) => <button key={mode} disabled={refining} onClick={() => refine(mode)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-blue-200 hover:text-[#0A4FE8] disabled:opacity-50">{refining ? "Working…" : label}</button>)}
          </div>
          <RichDocEditor value={active.bodyHtml} onChange={(bodyHtml) => patch({ bodyHtml })} placeholder="Write your official letter…" />
        </section>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-[13px] font-bold text-[#07133B]">Exact PDF preview</h2><p className="mt-0.5 text-[10px] text-gray-400">{active.paperSize === "legal" ? "Legal · 215.9 × 355.6 mm" : "A4 · 210 × 297 mm"}</p></div>
              <span aria-live="polite" className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-[#0A4FE8]">{previewBusy ? "Updating…" : `${previewPages.length || 1} ${previewPages.length === 1 ? "page" : "pages"}`}</span>
            </div>
            <div className="max-h-[72vh] space-y-4 overflow-y-auto rounded-xl bg-[#252525] p-2 sm:p-3">
              {previewBusy && !previewPages.length && <div className="grid min-h-64 place-items-center text-center text-[11px] text-white/70"><div><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Laying out the exact PDF pages…</div></div>}
              {previewError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[10.5px] text-rose-700">{previewError}</p>}
              {previewPages.map((page, index) => {
                const signaturePageIndex = active.signaturePage === "first" ? 0 : previewPages.length - 1;
                const showSignature = Boolean(active.signatureUrl) && index === signaturePageIndex;
                return (
                  <div key={`${active.id}-${index}`}>
                    <p className="mb-1.5 text-center text-[10px] font-semibold text-white/70">Page {index + 1}</p>
                    <div ref={showSignature ? signaturePreviewRef : undefined} className={`relative mx-auto w-full max-w-[520px] overflow-hidden bg-white shadow-lg transition-opacity ${previewBusy ? "opacity-60" : "opacity-100"}`} style={{ aspectRatio: previewAspect }}>
                      <img src={page} alt={`Exact PDF preview, page ${index + 1}`} className="absolute inset-0 h-full w-full object-fill" />
                      {showSignature && active.signatureUrl && <DraggableSignature active={active} previewRef={signaturePreviewRef} onChange={(signatureX, signatureY) => patch({ signatureX, signatureY })} />}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-center text-[10px] text-gray-400">Every visible page break is generated by the same layout engine used for export.</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-[13px] font-bold text-[#07133B]">Signature</h2>
            <p className="mt-1 text-[11px] text-gray-400">Upload or paste a signature, then drag it anywhere on the preview.</p>
            <div className="mt-3"><AssetUpload label="Signature image" name={active.signatureName} kind="signature" busy={uploading === "signature"} onFile={upload} paste /></div>
            {active.signatureUrl && <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-[11px] font-semibold text-gray-600">Place on<select value={active.signaturePage} onChange={(event) => patch({ signaturePage: event.target.value === "first" ? "first" : "last" })} className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-[11px]"><option value="last">Last page</option><option value="first">First page</option></select></label><label className="text-[11px] font-semibold text-gray-600">Size<input type="range" min="8" max="50" value={active.signatureWidth} onChange={(event) => patch({ signatureWidth: Number(event.target.value) })} className="mt-3 w-full accent-[#0A4FE8]" /></label></div>}
          </div>
        </aside>
      </div>

      <Dialog open={exportDialogOpen} onOpenChange={(open) => { if (!exportingSize) setExportDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Choose PDF download size</DialogTitle>
            <DialogDescription>Select the balance of print quality and file size that suits how you will share the letter.</DialogDescription>
          </DialogHeader>
          <div className="mt-3 grid gap-3">
            <ExportSizeOption
              title="Original file size"
              detail={`${formatFileSize(originalPdfBytes?.byteLength || 0)} · Best print quality`}
              description="Keeps the original artwork, vector text and highest available image detail."
              busy={exportingSize === "original"}
              disabled={Boolean(exportingSize)}
              onClick={() => void downloadExport("original")}
            />
            <ExportSizeOption
              title="Compressed size"
              detail={`${formatFileSize(Math.floor((originalPdfBytes?.byteLength || 0) * 0.5))} target · 50% smaller`}
              description="Creates a substantially smaller sharing copy while retaining clear document detail."
              busy={exportingSize === "compressed"}
              disabled={Boolean(exportingSize)}
              onClick={() => void downloadExport("compressed")}
            />
            <ExportSizeOption
              title="Lite version"
              detail={`${formatFileSize(Math.floor((originalPdfBytes?.byteLength || 0) * 0.75))} target · 25% smaller`}
              description="Creates a lightly reduced copy with more image detail than the compressed version."
              busy={exportingSize === "lite"}
              disabled={Boolean(exportingSize)}
              onClick={() => void downloadExport("lite")}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (!bytes) return "Calculating…";
  const megabytes = bytes / (1024 * 1024);
  return megabytes < 0.1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${megabytes.toFixed(megabytes >= 10 ? 1 : 2)} MB`;
}

function ExportSizeOption({ title, detail, description, busy, disabled, onClick }: { title: string; detail: string; description: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="group flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/60 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-60">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8] group-hover:bg-white">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><strong className="text-[14px] text-[#07133B]">{title}</strong><span className="text-[11px] font-semibold text-[#0A4FE8]">{busy ? "Preparing download…" : detail}</span></span>
        <span className="mt-1 block text-[11.5px] leading-5 text-gray-500">{description}</span>
      </span>
    </button>
  );
}

function PrivacyNotice() {
  return <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><p className="text-[11.5px] leading-relaxed text-emerald-900"><strong>Private and confidential.</strong> Your dashboard content is encrypted in transit and stored privately on secured CDS Space cloud infrastructure. Only your authenticated account can access these letterhead drafts and files.</p></div>;
}

/**
 * Mirrors LETTERHEAD_MAX_BYTES on the server. Kept here because that constant
 * lives in a server-only module the browser bundle cannot import.
 */
const ASSET_MAX_BYTES = 5 * 1024 * 1024;

function AssetUpload({ label, name, kind, busy, onFile, paste = false }: { label: string; name: string | null; kind: AssetKind; busy: boolean; onFile: (kind: AssetKind, file: File) => void; paste?: boolean }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  // Cmd/Ctrl+V while the box is focused. Some browsers only hand over copied
  // files this way, so it stays alongside the button.
  function pasted(event: React.ClipboardEvent<HTMLButtonElement>) {
    const file = [...event.clipboardData.files][0];
    if (file) { event.preventDefault(); setPasteNote(null); void onFile(kind, file); }
  }

  /**
   * Reads whatever image is on the clipboard at the click. Browsers only allow
   * this inside a click, and only for images - a file copied from Finder or
   * Explorer is not exposed to this API, so that case gets a clear message
   * rather than silently doing nothing.
   */
  async function pasteFromClipboard() {
    setPasteNote(null);
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.read !== "function") {
      setPasteNote("This browser cannot read the clipboard from a button. Click the box and press Cmd/Ctrl + V instead.");
      return;
    }
    try {
      const items = await clipboard.read();
      for (const item of items) {
        const type = item.types.find((entry) => entry.startsWith("image/")) || item.types.find((entry) => entry === "application/pdf");
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type === "application/pdf" ? "pdf" : (type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
        void onFile(kind, new File([blob], `pasted-${kind}-${Date.now()}.${extension}`, { type }));
        return;
      }
      setPasteNote("Nothing to paste. Copy an image first, or press Cmd/Ctrl + V on the box for a copied file.");
    } catch {
      setPasteNote("Clipboard access was blocked. Allow it when your browser asks, or click the box and press Cmd/Ctrl + V.");
    }
  }

  return <div>
    <p className="mb-1.5 text-[11px] font-semibold text-gray-600">{label}</p>
    <div className="flex items-stretch gap-2">
      <button type="button" onClick={() => input.current?.click()} onPaste={pasted} className="flex min-h-20 min-w-0 flex-1 items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-left hover:border-blue-300 hover:bg-blue-50/40">{busy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#0A4FE8]" /> : name ? <Check className="h-5 w-5 shrink-0 text-emerald-600" /> : <Upload className="h-5 w-5 shrink-0 text-[#0A4FE8]" />}<span className="min-w-0"><span className="block truncate text-[11.5px] font-semibold text-[#07133B]">{name || (paste ? "Upload or paste signature" : "Upload JPG, PNG, PDF, or SVG")}</span><span className="block text-[10px] text-gray-400">Up to 5MB</span></span></button>
      <button type="button" onClick={() => void pasteFromClipboard()} disabled={busy} className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-3 text-[10.5px] font-semibold text-[#0A4FE8] hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50" aria-label={`Paste ${label.toLowerCase()} from clipboard`}>
        <ClipboardPaste className="h-4 w-4" />
        Click to paste
      </button>
    </div>
    {pasteNote && <p className="mt-1.5 text-[10.5px] leading-4 text-amber-700">{pasteNote}</p>}
    <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(kind, file); event.currentTarget.value = ""; }} />
  </div>;
}

function DraggableSignature({ active, previewRef, onChange }: { active: Letterhead; previewRef: React.RefObject<HTMLDivElement | null>; onChange: (x: number, y: number) => void }) {
  function pointerDown(event: React.PointerEvent<HTMLImageElement>) {
    const frame = previewRef.current;
    if (!frame) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = frame.getBoundingClientRect();
    const start = { pointerX: event.clientX, pointerY: event.clientY, x: active.signatureX, y: active.signatureY };
    const move = (next: PointerEvent) => {
      const x = Math.max(0, Math.min(100 - active.signatureWidth, start.x + ((next.clientX - start.pointerX) / bounds.width) * 100));
      const y = Math.max(0, Math.min(92, start.y + ((next.clientY - start.pointerY) / bounds.height) * 100));
      onChange(x, y);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  return <img src={active.signatureUrl || ""} alt="Signature" onPointerDown={pointerDown} className="absolute z-10 cursor-grab touch-none object-contain active:cursor-grabbing" style={{ left: `${active.signatureX}%`, top: `${active.signatureY}%`, width: `${active.signatureWidth}%` }} />;
}
