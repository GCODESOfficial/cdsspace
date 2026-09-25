"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, FileSignature, Loader2, LockKeyhole, Move, PenLine, Upload } from "lucide-react";
import { LiveSignaturePad } from "@/components/csign/LiveSignaturePad";
import type { LetterheadPdfOptions } from "@/lib/letterhead-pdf";

type SignatureStatus = "pending" | "opened" | "signed" | "declined";
type Payload = {
  request: {
    signerName: string | null;
    signerEmail: string | null;
    status: SignatureStatus;
    signatureX: number;
    signatureY: number;
    signatureWidth: number;
    signaturePage: "first" | "last";
  };
  document: {
    title: string;
    bodyHtml: string;
    paperSize: "a4" | "legal";
    bottomMargin: "wide" | "small";
    hasSecondPage: boolean;
    firstPageUrl: string | null;
    secondPageUrl: string | null;
    stampUrl: string | null;
    stampX: number;
    stampY: number;
    stampWidth: number;
    stampPage: "first" | "last";
  };
};

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
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      return { buildLetterheadPdf: pdfModule.buildLetterheadPdf, pdfjs };
    });
  }
  return previewRuntimePromise;
}

function canvasObjectUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("Preview unavailable.")), "image/webp", 0.9);
  });
}

export default function LetterheadSignerPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || "");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signatureX, setSignatureX] = useState(54);
  const [signatureY, setSignatureY] = useState(72);
  const [signatureWidth, setSignatureWidth] = useState(22);
  const [signaturePage, setSignaturePage] = useState<"first" | "last">("last");
  const [signatureMode, setSignatureMode] = useState<"draw" | "upload">("draw");
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const previewUrls = useRef<string[]>([]);
  const signatureObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void fetch(`/api/letterhead-sign/${token}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setError(result.error || "This signing link is unavailable.");
      else {
        const next = result as Payload;
        setPayload(next);
        setSignatureX(next.request.signatureX);
        setSignatureY(next.request.signatureY);
        setSignatureWidth(next.request.signatureWidth);
        setSignaturePage(next.request.signaturePage);
      }
    }).catch(() => setError("The signing request could not be loaded.")).finally(() => setLoading(false));
  }, [token]);

  const previewSource = useMemo<LetterheadPdfOptions | null>(() => payload ? {
    title: payload.document.title,
    bodyHtml: payload.document.bodyHtml,
    paperSize: payload.document.paperSize,
    bottomMargin: payload.document.bottomMargin,
    hasSecondPage: payload.document.hasSecondPage,
    firstPageUrl: payload.document.firstPageUrl,
    secondPageUrl: payload.document.secondPageUrl,
    signatureUrl: null,
    signatureX: 0,
    signatureY: 0,
    signatureWidth: 20,
    signaturePage: "last",
    stampUrl: payload.document.stampUrl,
    stampX: payload.document.stampX,
    stampY: payload.document.stampY,
    stampWidth: payload.document.stampWidth,
    stampPage: payload.document.stampPage,
    // Invitees receive the document itself, never another person's signature.
    signatures: [],
  } : null, [payload]);

  useEffect(() => {
    if (!previewSource) return;
    let cancelled = false;
    let loadingTask: ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]> | null = null;
    void (async () => {
      setPreviewBusy(true);
      const generated: string[] = [];
      try {
        const { buildLetterheadPdf, pdfjs } = await loadPreviewRuntime();
        const document = await buildLetterheadPdf(previewSource, { includeSignature: false, includeStamp: true });
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(document.output("arraybuffer")) });
        const pdf = await loadingTask.promise;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("This browser cannot render the document preview.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          generated.push(await canvasObjectUrl(canvas));
          page.cleanup();
          canvas.width = 1;
          canvas.height = 1;
        }
        if (cancelled) generated.forEach((url) => URL.revokeObjectURL(url));
        else {
          previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
          previewUrls.current = generated;
          setPreviewPages(generated);
        }
      } catch (failure) {
        generated.forEach((url) => URL.revokeObjectURL(url));
        if (!cancelled) setError(failure instanceof Error ? failure.message : "The document preview could not be prepared.");
      } finally {
        await loadingTask?.destroy().catch(() => undefined);
        if (!cancelled) setPreviewBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [previewSource]);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    if (signatureObjectUrl.current) URL.revokeObjectURL(signatureObjectUrl.current);
  }, []);

  function chooseSignature(file: File) {
    setError("");
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setError("Upload a PNG, JPG, or WebP signature image up to 5MB.");
      return;
    }
    if (signatureObjectUrl.current) URL.revokeObjectURL(signatureObjectUrl.current);
    signatureObjectUrl.current = URL.createObjectURL(file);
    setSignatureFile(file);
    setSignatureUrl(signatureObjectUrl.current);
  }

  async function submit() {
    if (!signatureFile) { setError("Draw or upload your signature first."); return; }
    setSaving(true); setError("");
    const form = new FormData();
    form.set("file", signatureFile);
    form.set("signatureX", String(signatureX));
    form.set("signatureY", String(signatureY));
    form.set("signatureWidth", String(signatureWidth));
    form.set("signaturePage", signaturePage);
    const response = await fetch(`/api/letterhead-sign/${token}`, { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(result.error || "The signature could not be submitted."); return; }
    setPayload((current) => current ? { ...current, request: { ...current.request, status: "signed" } } : current);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F3F6FB]"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></main>;
  if (!payload) return <main className="grid min-h-screen place-items-center bg-[#F3F6FB] p-6"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><FileSignature className="mx-auto h-8 w-8 text-slate-300" /><h1 className="mt-4 text-xl font-semibold text-[#07133B]">Signing link unavailable</h1><p className="mt-2 text-sm text-slate-500">{error}</p><Link href="/" className="mt-6 inline-flex text-sm font-semibold text-[#0A4FE8]">Return to CDS Space</Link></section></main>;

  const complete = payload.request.status === "signed";
  const declined = payload.request.status === "declined";
  const previewAspect = payload.document.paperSize === "legal" ? 215.9 / 355.6 : 210 / 297;
  const targetPageIndex = signaturePage === "first" ? 0 : Math.max(0, previewPages.length - 1);

  return (
    <main className="min-h-screen bg-[#F3F6FB] px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl bg-[#0A4FE8] p-5 text-white shadow-lg sm:p-8">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15"><FileSignature className="h-5 w-5" /></span><div><p className="text-xs font-semibold text-white/75">CDS Space cSign</p><h1 className="mt-1 text-xl font-semibold sm:text-3xl">{payload.document.title}</h1><p className="mt-2 text-sm text-white/80">Private signature request for {payload.request.signerName || payload.request.signerEmail || "invited signer"}. No account is required.</p></div></div>
        </header>

        {complete ? (
          <section className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" /><h2 className="mt-3 text-xl font-semibold text-[#07133B]">Signature submitted</h2><p className="mt-1 text-sm text-slate-500">Your positioned signature has been securely returned to the sender.</p></section>
        ) : declined ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">This signature request was declined.</section>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-[#07133B]">Document preview</h2><p className="mt-0.5 text-[11px] text-slate-500">This exact letterhead preview deliberately hides every other person’s signature.</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-[#0A4FE8]">{previewBusy ? "Preparing preview…" : `${previewPages.length || 1} page${previewPages.length === 1 ? "" : "s"}`}</span></div>
              <div className="max-h-[76vh] space-y-4 overflow-y-auto rounded-2xl bg-[#252525] p-2 sm:p-4">
                {previewBusy && !previewPages.length && <div className="grid min-h-80 place-items-center text-sm text-white/70"><span className="text-center"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Rendering the current letterhead…</span></div>}
                {previewPages.map((page, index) => (
                  <div key={page}>
                    <p className="mb-1.5 text-center text-[10px] font-semibold text-white/70">Page {index + 1}</p>
                    <div className="relative mx-auto w-full max-w-[640px] overflow-hidden bg-white shadow-xl" style={{ aspectRatio: previewAspect }}>
                      <img src={page} alt={`Letterhead preview page ${index + 1}`} className="absolute inset-0 h-full w-full object-fill" />
                      {index === targetPageIndex && <SignerPlacement imageUrl={signatureUrl} x={signatureX} y={signatureY} width={signatureWidth} onChange={(x, y) => { setSignatureX(x); setSignatureY(y); }} />}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-base font-semibold text-[#07133B]">Add only your signature</h2>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">Draw with cSign or upload a signature image. Then drag it into position on the document before submitting.</p>
                <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setSignatureMode("draw")} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-[12px] font-semibold ${signatureMode === "draw" ? "border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]" : "border-slate-200 text-slate-600"}`}><PenLine className="h-4 w-4" />Draw</button><button type="button" onClick={() => { setSignatureMode("upload"); uploadInput.current?.click(); }} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-[12px] font-semibold ${signatureMode === "upload" ? "border-[#0A4FE8] bg-blue-50 text-[#0A4FE8]" : "border-slate-200 text-slate-600"}`}><Upload className="h-4 w-4" />Upload</button></div>
                <input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) chooseSignature(file); event.currentTarget.value = ""; }} />
                {signatureMode === "draw" && <div className="mt-4"><LiveSignaturePad busy={false} onSave={chooseSignature} /></div>}
                {signatureMode === "upload" && <button type="button" onClick={() => uploadInput.current?.click()} className="mt-4 flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 text-center text-[12px] font-semibold text-[#0A4FE8]"><Upload className="h-5 w-5" />Choose a PNG, JPG, or WebP signature</button>}
                {signatureFile && <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /><span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-emerald-900">{signatureFile.name}</span></div>}
                <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-[11px] font-semibold text-slate-600">Signature page<select value={signaturePage} onChange={(event) => setSignaturePage(event.target.value === "first" ? "first" : "last")} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px]"><option value="last">Last page</option><option value="first">First page</option></select></label><label className="text-[11px] font-semibold text-slate-600">Signature size<input type="range" min="8" max="50" value={signatureWidth} onChange={(event) => setSignatureWidth(Number(event.target.value))} className="mt-4 w-full accent-[#0A4FE8]" /></label></div>
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-600"><Move className="mt-0.5 h-4 w-4 shrink-0 text-[#0A4FE8]" />Drag your signature or the marked signing area directly on the preview.</div>
                {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p>}
                <button type="button" onClick={() => void submit()} disabled={!signatureFile || saving || previewBusy} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-[13px] font-semibold text-white hover:bg-[#083EC0] disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? "Submitting securely…" : "Submit positioned signature"}</button>
              </section>
              <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[11px] leading-5 text-emerald-900"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />You can review this document and submit only your own signature. The letter cannot be edited, and other signatures are not shared with you.</div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function SignerPlacement({ imageUrl, x, y, width, onChange }: { imageUrl: string | null; x: number; y: number; width: number; onChange: (x: number, y: number) => void }) {
  function pointerDown(event: React.PointerEvent<HTMLElement>) {
    const frame = event.currentTarget.parentElement;
    if (!frame) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = frame.getBoundingClientRect();
    const start = { pointerX: event.clientX, pointerY: event.clientY, x, y };
    const move = (next: PointerEvent) => onChange(
      Math.max(0, Math.min(100 - width, start.x + ((next.clientX - start.pointerX) / bounds.width) * 100)),
      Math.max(0, Math.min(94, start.y + ((next.clientY - start.pointerY) / bounds.height) * 100)),
    );
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  return imageUrl ? (
    <img src={imageUrl} alt="Your signature placement" onPointerDown={pointerDown} className="absolute z-10 cursor-grab touch-none object-contain active:cursor-grabbing" style={{ left: `${x}%`, top: `${y}%`, width: `${width}%` }} />
  ) : (
    <button type="button" onPointerDown={pointerDown} className="absolute z-10 flex min-h-9 cursor-grab touch-none items-center justify-center rounded border-2 border-dashed border-[#0A4FE8] bg-blue-50/80 px-2 text-[8px] font-semibold text-[#0A4FE8] active:cursor-grabbing sm:text-[10px]" style={{ left: `${x}%`, top: `${y}%`, width: `${Math.max(width, 24)}%` }}>Your signature goes here</button>
  );
}
