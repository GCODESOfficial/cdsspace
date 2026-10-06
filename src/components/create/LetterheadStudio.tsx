"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Archive, Bookmark, Check, ChevronDown, CreditCard, ClipboardPaste, Copy, Download, FileText, Library, Loader2, LockKeyhole, PenLine, Plus, RefreshCw, Send, Stamp, Trash2, Upload, Users, X } from "lucide-react";
import { RichDocEditor } from "@/components/cdocs/rich-doc-editor";
import { appConfirm } from "@/lib/app-notify";
import { offerClientStorageRequest } from "@/lib/client-storage-ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LetterheadExportSize } from "@/lib/letterhead-pdf";
import { LiveSignaturePad } from "@/components/csign/LiveSignaturePad";
import { ContextualTutorialPrompt } from "@/components/tutorials/ContextualTutorialPrompt";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";

type AdditionalSignature = {
  id: string;
  source: "upload" | "invitation";
  signerName: string | null;
  signerEmail: string | null;
  status: "ready" | "pending" | "opened" | "signed" | "declined";
  signatureUrl: string | null;
  signatureX: number;
  signatureY: number;
  signatureWidth: number;
  signaturePage: "first" | "last";
  shareUrl: string | null;
  signedAt: string | null;
};

type Letterhead = {
  id: string;
  title: string;
  bodyHtml: string;
  paperSize: "a4" | "legal";
  bottomMargin: "wide" | "small";
  /** Body leading multiplier: 1 single, 1.5 one-and-a-half, 2 double. */
  lineSpacing: number;
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
  stampName: string | null;
  stampUrl: string | null;
  stampX: number;
  stampY: number;
  stampWidth: number;
  stampPage: "first" | "last";
  signatures: AdditionalSignature[];
  status: "draft" | "ready" | "archived";
  deliveredByCds: boolean;
  deliveredAt: string | null;
  lastExportedAt: string | null;
  updatedAt: string;
};

type AssetKind = "firstPage" | "secondPage" | "signature" | "stamp";
type SaveState = "idle" | "saving" | "saved" | "error";
type WorkspaceKind = "client" | "team" | "admin";
type DeliveryClient = { id: string; platform_user_id: string | null; has_platform_account: boolean; name: string; brand_name: string | null; email: string | null };
type SavedSignature = { id: string; name: string; assetUrl: string; updatedAt: string };
type SignatureSaveSource = { kind: "primary" } | { kind: "additional"; id: string; suggestedName: string };

function apiPath(path: string, workspaceKind: WorkspaceKind, scope: "create" | "executive_board" = "create") {
  const joined = `${path}${path.includes("?") ? "&" : "?"}workspace=${workspaceKind}`;
  return scope === "create" ? joined : `${joined}&scope=${scope}`;
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

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("The preview page could not be prepared."));
      else resolve(blob);
    }, "image/webp", 0.9);
  });
}

const PREVIEW_CACHE_NAME = "cds-private-letterhead-previews-v1";
const PREVIEW_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PREVIEW_MEMORY_LIMIT = 16;
const previewBlobMemory = new Map<string, { blobs: Blob[]; savedAt: number }>();

async function previewCacheBase(item: Letterhead, workspaceKind: WorkspaceKind, scope: "create" | "executive_board", variant: "card" | "exact") {
  const source = JSON.stringify({
    id: item.id,
    title: item.title,
    bodyHtml: item.bodyHtml,
    paperSize: item.paperSize,
    bottomMargin: item.bottomMargin,
    hasSecondPage: item.hasSecondPage,
    firstPageUrl: item.firstPageUrl,
    secondPageUrl: item.secondPageUrl,
  });
  let fingerprint = "";
  try {
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    // Older embedded browsers still get a deterministic versioned cache key.
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
    fingerprint = `${source.length}-${(hash >>> 0).toString(16)}`;
  }
  return `${window.location.origin}/__cds-private-preview-cache__/${encodeURIComponent(workspaceKind)}/${encodeURIComponent(scope)}/${encodeURIComponent(item.id)}/${variant}/${fingerprint}`;
}

function rememberPreview(base: string, blobs: Blob[], savedAt = Date.now()) {
  previewBlobMemory.delete(base);
  previewBlobMemory.set(base, { blobs, savedAt });
  while (previewBlobMemory.size > PREVIEW_MEMORY_LIMIT) {
    const oldest = previewBlobMemory.keys().next().value as string | undefined;
    if (!oldest) break;
    previewBlobMemory.delete(oldest);
  }
}

async function readCachedPreview(base: string): Promise<Blob[] | null> {
  const memory = previewBlobMemory.get(base);
  if (memory && Date.now() - memory.savedAt < PREVIEW_CACHE_TTL_MS) {
    rememberPreview(base, memory.blobs, memory.savedAt);
    return memory.blobs;
  }
  if (typeof window.caches === "undefined") return null;
  try {
    const cache = await window.caches.open(PREVIEW_CACHE_NAME);
    const manifestResponse = await cache.match(`${base}/manifest`);
    if (!manifestResponse) return null;
    const manifest = await manifestResponse.json() as { pageCount?: number; savedAt?: number };
    if (!manifest.pageCount || !manifest.savedAt || Date.now() - manifest.savedAt >= PREVIEW_CACHE_TTL_MS) {
      await cache.delete(`${base}/manifest`);
      return null;
    }
    const pages = await Promise.all(Array.from({ length: manifest.pageCount }, (_, index) => cache.match(`${base}/page-${index}.webp`)));
    if (pages.some((page) => !page)) return null;
    const blobs = await Promise.all(pages.map((page) => page!.blob()));
    rememberPreview(base, blobs, manifest.savedAt);
    return blobs;
  } catch {
    return null;
  }
}

async function cachePreview(base: string, blobs: Blob[]) {
  const savedAt = Date.now();
  rememberPreview(base, blobs, savedAt);
  if (typeof window.caches === "undefined") return;
  try {
    const cache = await window.caches.open(PREVIEW_CACHE_NAME);
    const currentPrefix = base.slice(0, base.lastIndexOf("/") + 1);
    const keys = await cache.keys();
    await Promise.all(keys.filter((request) => request.url.startsWith(currentPrefix) && !request.url.startsWith(`${base}/`)).map((request) => cache.delete(request)));
    await Promise.all([
      cache.put(`${base}/manifest`, new Response(JSON.stringify({ pageCount: blobs.length, savedAt }), { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=604800" } })),
      ...blobs.map((blob, index) => cache.put(`${base}/page-${index}.webp`, new Response(blob, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=604800" } }))),
    ]);
  } catch {
    // Preview rendering remains functional when Cache Storage is unavailable.
  }
}

/**
 * Render the opening of a saved document, not just its blank stationery.
 * Work begins only when the card approaches the viewport so a large library
 * does not build dozens of PDFs at once.
 */
function SavedLetterheadPreview({ item, workspaceKind, scope }: { item: Letterhead; workspaceKind: WorkspaceKind; scope: "create" | "executive_board" }) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || (!item.firstPageUrl && !item.bodyHtml.trim())) return;
    let cancelled = false;
    let generatedUrl: string | null = null;
    let loadingTask: ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]> | null = null;

    void (async () => {
      setRendering(true);
      try {
        const cacheBase = await previewCacheBase(item, workspaceKind, scope, "card");
        const cached = await readCachedPreview(cacheBase);
        if (cached?.[0]) {
          generatedUrl = URL.createObjectURL(cached[0]);
          if (cancelled) { URL.revokeObjectURL(generatedUrl); generatedUrl = null; return; }
          setPreviewUrl(generatedUrl);
          return;
        }
        const { buildLetterheadPdf, pdfjs } = await loadPreviewRuntime();
        const pdfDocument = await buildLetterheadPdf({ ...item, signatureUrl: null }, { includeSignature: false });
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfDocument.output("arraybuffer")) });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.8 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("This browser cannot render saved document previews.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const previewBlob = await canvasBlob(canvas);
        generatedUrl = URL.createObjectURL(previewBlob);
        void cachePreview(cacheBase, [previewBlob]);
        page.cleanup();
        canvas.width = 1;
        canvas.height = 1;
        if (cancelled) {
          URL.revokeObjectURL(generatedUrl);
          generatedUrl = null;
          return;
        }
        setPreviewUrl(generatedUrl);
      } catch {
        // The stationery image below remains a useful fallback.
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
      void loadingTask?.destroy().catch(() => undefined);
    };
  }, [item.bodyHtml, item.bottomMargin, item.lineSpacing, item.firstPageUrl, item.hasSecondPage, item.id, item.paperSize, item.secondPageUrl, item.title, item.updatedAt, scope, visible, workspaceKind]);

  return (
    <div ref={frame} className="absolute inset-0 bg-white">
      {previewUrl ? (
        <img src={previewUrl} alt={item.title + " document preview"} className="absolute inset-x-0 top-0 h-auto w-full bg-white" />
      ) : item.firstPageUrl ? (
        <img src={item.firstPageUrl} alt={item.title + " stationery preview"} loading="lazy" decoding="async" className="absolute inset-x-0 top-0 h-auto w-full bg-white" />
      ) : (
        <div className="grid h-full place-items-center text-center"><span><FileText className="mx-auto h-7 w-7 text-blue-300" /><span className="mt-1.5 block text-[10px] font-semibold text-gray-400">Add letterhead artwork</span></span></div>
      )}
      {rendering && <span className="absolute bottom-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-white/95 text-[#0A4FE8] shadow" aria-label="Preparing document preview"><Loader2 className="h-3.5 w-3.5 animate-spin" /></span>}
    </div>
  );
}

export function LetterheadStudio({
  onBack,
  workspaceKind,
  /** Executive Board documents live apart from the per-workspace CREATE ones. */
  scope = "create",
  /**
   * Company correspondence is written on the one CDS Space letterhead, so the
   * per-document design controls are hidden rather than disabled: there is
   * nothing to choose.
   */
  lockedLetterhead = false,
  initialLetterheadId = null,
}: {
  onBack: () => void;
  workspaceKind: WorkspaceKind;
  scope?: "create" | "executive_board";
  lockedLetterhead?: boolean;
  initialLetterheadId?: string | null;
}) {
  const [items, setItems] = useState<Letterhead[]>([]);
  const [active, setActive] = useState<Letterhead | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<AssetKind | null>(null);
  const [refining, setRefining] = useState(false);
  // Asking the CDS Space team to design a letterhead raises an invoice, so the
  // outcome is held here and shown in place rather than as a transient toast.
  const [designRequest, setDesignRequest] = useState<{ invoiceNumber: string; publicToken: string; total: number; currency: string; alreadyRequested: boolean } | null>(null);
  const [requestingDesign, setRequestingDesign] = useState(false);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preparingExport, setPreparingExport] = useState(false);
  const [exportingSize, setExportingSize] = useState<LetterheadExportSize | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [letterheadConfigOpen, setLetterheadConfigOpen] = useState(true);
  const [signingConfigOpen, setSigningConfigOpen] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ shareUrl: string; emailed: boolean } | null>(null);
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [signatureLibraryBusy, setSignatureLibraryBusy] = useState<string | null>(null);
  const [signatureSaveSource, setSignatureSaveSource] = useState<SignatureSaveSource | null>(null);
  const [signatureSaveName, setSignatureSaveName] = useState("");
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryClients, setDeliveryClients] = useState<DeliveryClient[]>([]);
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliveryClientId, setDeliveryClientId] = useState("");
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [originalPdfBytes, setOriginalPdfBytes] = useState<ArrayBuffer | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedId = useRef<string | null>(null);
  const signaturePreviewRef = useRef<HTMLDivElement | null>(null);
  const stampPreviewRef = useRef<HTMLDivElement | null>(null);
  const multipleSignatureInput = useRef<HTMLInputElement | null>(null);
  const previewUrls = useRef<string[]>([]);
  const deepLinkOpened = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(apiPath("/api/create/letterheads", workspaceKind, scope), { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || "Letterheads could not be loaded."); return; }
    setItems(payload.letterheads || []);
  }, [scope, workspaceKind]);

  const loadSavedSignatures = useCallback(async () => {
    const response = await fetch(apiPath("/api/create/signatures", workspaceKind, scope), { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setSavedSignatures(payload.signatures || []);
  }, [scope, workspaceKind]);

  useEffect(() => {
    void load();
    void loadSavedSignatures();
    // Download and initialise the heavy renderer while the saved-document
    // library is being read, rather than after somebody opens a document.
    void loadPreviewRuntime();
  }, [load, loadSavedSignatures]);

  useEffect(() => {
    if (!initialLetterheadId || deepLinkOpened.current || active) return;
    const requested = items.find((item) => item.id === initialLetterheadId);
    if (!requested) return;
    deepLinkOpened.current = true;
    open(requested);
  }, [active, initialLetterheadId, items]);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
  }, []);

  function open(item: Letterhead) {
    loadedId.current = item.id;
    setActive(item);
    setLetterheadConfigOpen(!(item.firstPageName && (!item.hasSecondPage || item.secondPageName)));
    setSigningConfigOpen(!(item.signatureUrl || item.stampUrl || item.signatures.some((signature) => signature.status !== "declined")));
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
    setPreviewPages([]);
    setError(null);
    setSaveState("idle");
  }

  async function create() {
    setCreating(true); setError(null);
    const response = await fetch(apiPath("/api/create/letterheads", workspaceKind, scope), { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setCreating(false);
    if (!response.ok) { setError(payload.error || "The draft could not be created."); return; }
    setItems((current) => [payload.letterhead, ...current]);
    open(payload.letterhead);
  }

  const persist = useCallback(async (draft: Letterhead): Promise<boolean> => {
    setSaveState("saving");
    try {
      const response = await fetch(apiPath(`/api/create/letterheads/${draft.id}`, workspaceKind, scope), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          bodyHtml: draft.bodyHtml,
          paperSize: draft.paperSize,
          bottomMargin: draft.bottomMargin,
          lineSpacing: draft.lineSpacing,
          hasSecondPage: draft.hasSecondPage,
          signatureX: draft.signatureX,
          signatureY: draft.signatureY,
          signatureWidth: draft.signatureWidth,
          signaturePage: draft.signaturePage,
          stampX: draft.stampX,
          stampY: draft.stampY,
          stampWidth: draft.stampWidth,
          stampPage: draft.stampPage,
          signatures: draft.signatures.map((signature) => ({ id: signature.id, signatureX: signature.signatureX, signatureY: signature.signatureY, signatureWidth: signature.signatureWidth, signaturePage: signature.signaturePage })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setSaveState("error"); setError(payload.error || "Changes could not be saved."); return false; }
      setSaveState("saved");
      setItems((current) => current.map((item) => item.id === draft.id ? { ...item, ...draft, updatedAt: payload.letterhead.updatedAt } : item));
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
  }, [active?.id, active?.title, active?.bodyHtml, active?.paperSize, active?.bottomMargin, active?.lineSpacing, active?.hasSecondPage, active?.signatureX, active?.signatureY, active?.signatureWidth, active?.signaturePage, active?.stampX, active?.stampY, active?.stampWidth, active?.stampPage, active?.signatures, persist]);

  const awaitingSignatureKey = active?.signatures
    .filter((signature) => signature.status === "pending" || signature.status === "opened")
    .map((signature) => `${signature.id}:${signature.status}`)
    .join("|") || "";

  // An account-free signer finishes outside this authenticated editor. Poll
  // only while a request is outstanding, and merge signature state without
  // replacing unsaved document text currently being edited by the sender.
  useEffect(() => {
    if (!active?.id || !awaitingSignatureKey) return;
    const letterheadId = active.id;
    let stopped = false;
    const sync = async () => {
      const response = await fetch(apiPath(`/api/create/letterheads/${letterheadId}`, workspaceKind, scope), { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (stopped || !response.ok || !payload.letterhead) return;
      const signatures = payload.letterhead.signatures as AdditionalSignature[];
      setActive((current) => {
        if (!current || current.id !== letterheadId) return current;
        const before = current.signatures.map((item) => `${item.id}:${item.status}:${item.signatureUrl || ""}:${item.signatureX}:${item.signatureY}:${item.signatureWidth}:${item.signaturePage}`).join("|");
        const after = signatures.map((item) => `${item.id}:${item.status}:${item.signatureUrl || ""}:${item.signatureX}:${item.signatureY}:${item.signatureWidth}:${item.signaturePage}`).join("|");
        return before === after ? current : { ...current, signatures };
      });
      setItems((current) => current.map((item) => item.id === letterheadId ? { ...item, signatures, updatedAt: payload.letterhead.updatedAt } : item));
    };
    const timer = window.setInterval(() => void sync(), 4000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [active?.id, awaitingSignatureKey, scope, workspaceKind]);

  function patch(values: Partial<Letterhead>) {
    setActive((current) => current ? { ...current, ...values } : current);
  }

  /** Takes a signature or seal off the page, after a confirmation. */
  async function removeAsset(kind: AssetKind) {
    if (!active) return;
    const what = kind === "signature" ? "signature" : kind === "stamp" ? "seal" : "letterhead design";
    if (!(await appConfirm(`Remove this ${what} from the document? You can upload or sign a new one afterwards.`))) return;
    setError(null);
    const response = await fetch(
      apiPath(`/api/create/letterheads/${active.id}/upload?kind=${kind}`, workspaceKind, scope),
      { method: "DELETE" },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || `The ${what} could not be removed.`); return; }
    setActive(payload.letterhead);
    setItems((current) => current.map((item) => item.id === active.id ? payload.letterhead : item));
    // Reopen the signing panel so a replacement is one step away.
    if (kind === "signature" || kind === "stamp") setSigningConfigOpen(true);
  }

  async function upload(kind: AssetKind, file: File) {
    if (!active) return;
    // Refused here too, so nobody waits for a large upload only to be told no.
    if (file.size > ASSET_MAX_BYTES) {
      setError(`${file.name || "That file"} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Letterheads, signatures, and stamps must be 5MB or smaller.`);
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!(await persist(active))) return;
    setUploading(kind); setError(null);
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}/upload`, workspaceKind, scope), { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    setUploading(null);
    if (!response.ok) {
      if (workspaceKind === "client" && await offerClientStorageRequest(payload.code)) return;
      setError(payload.error || "The file could not be uploaded."); return;
    }
    setActive(payload.letterhead);
    setItems((current) => current.map((item) => item.id === active.id ? payload.letterhead : item));
    if ((kind === "firstPage" || kind === "secondPage") && payload.letterhead.firstPageName && (!payload.letterhead.hasSecondPage || payload.letterhead.secondPageName)) setLetterheadConfigOpen(false);
    if (kind === "signature" || kind === "stamp") setSigningConfigOpen(false);
  }

  async function uploadMultipleSignatures(files: FileList | File[]) {
    if (!active || !files.length) return;
    const selected = Array.from(files).slice(0, 10);
    if (selected.some((file) => file.size > ASSET_MAX_BYTES)) { setError("Each signature must be 5MB or smaller."); return; }
    setUploading("signature"); setError(null);
    const form = new FormData(); selected.forEach((file) => form.append("files", file));
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}/signatures`, workspaceKind, scope), { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    setUploading(null);
    if (!response.ok) {
      if (workspaceKind === "client" && await offerClientStorageRequest(payload.code)) return;
      setError(payload.error || "The signatures could not be uploaded."); return;
    }
    setActive(payload.letterhead);
    setItems((current) => current.map((item) => item.id === active.id ? payload.letterhead : item));
    setSigningConfigOpen(false);
  }

  async function inviteSigner() {
    if (!active || !inviteEmail.trim()) return;
    setInviteBusy(true); setError(null); setInviteResult(null);
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}/signatures`, workspaceKind, scope), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: inviteName, signerEmail: inviteEmail }) });
    const payload = await response.json().catch(() => ({}));
    setInviteBusy(false);
    if (!response.ok) { setError(payload.error || "The signer invitation could not be created."); return; }
    setActive(payload.letterhead);
    setItems((current) => current.map((item) => item.id === active.id ? payload.letterhead : item));
    setInviteResult({ shareUrl: payload.shareUrl, emailed: Boolean(payload.emailed) });
    setSigningConfigOpen(false);
  }

  async function refreshActiveSignatures() {
    if (!active) return;
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}`, workspaceKind, scope), { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Signature status could not be refreshed."); return; }
    setActive(payload.letterhead);
    setItems((current) => current.map((item) => item.id === active.id ? payload.letterhead : item));
  }

  function applyUpdatedLetterhead(letterhead: Letterhead) {
    setActive(letterhead);
    setItems((current) => current.map((item) => item.id === letterhead.id ? letterhead : item));
  }

  async function removeAdditionalSignature(signature: AdditionalSignature) {
    if (!active) return;
    const label = signature.signerName || signature.signerEmail || "this signature";
    const verb = signature.status === "pending" || signature.status === "opened" ? "Cancel and remove" : "Remove";
    if (!(await appConfirm(`${verb} ${label}? This removes it from this document only.`))) return;
    setSignatureLibraryBusy(`remove:${signature.id}`); setError(null);
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}/signatures/${signature.id}`, workspaceKind, scope), { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setSignatureLibraryBusy(null);
    if (!response.ok) { setError(payload.error || "The signature could not be removed."); return; }
    applyUpdatedLetterhead(payload.letterhead);
  }

  async function removeAllSignatures() {
    if (!active) return;
    if (!(await appConfirm("Remove all signatures and cancel outstanding signature requests for this document? Your saved signature library and company seal will not be affected."))) return;
    setSignatureLibraryBusy("remove-all"); setError(null);
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}/signatures`, workspaceKind, scope), { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setSignatureLibraryBusy(null);
    if (!response.ok) { setError(payload.error || "The signatures could not be removed."); return; }
    applyUpdatedLetterhead(payload.letterhead);
  }

  function openSaveSignature(source: SignatureSaveSource) {
    setSignatureSaveSource(source);
    setSignatureSaveName(source.kind === "additional" ? source.suggestedName : active?.signatureName?.replace(/\.[^.]+$/, "") || "My signature");
  }

  async function saveSignatureToLibrary() {
    if (!active || !signatureSaveSource || !signatureSaveName.trim()) return;
    setSignatureLibraryBusy("save"); setError(null);
    const response = await fetch(apiPath("/api/create/signatures", workspaceKind, scope), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        letterheadId: active.id,
        name: signatureSaveName,
        sourceKind: signatureSaveSource.kind,
        sourceId: signatureSaveSource.kind === "additional" ? signatureSaveSource.id : undefined,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSignatureLibraryBusy(null);
    if (!response.ok) {
      if (workspaceKind === "client" && await offerClientStorageRequest(payload.code)) return;
      setError(payload.error || "The signature could not be saved."); return;
    }
    setSavedSignatures(payload.signatures || []);
    setSignatureSaveSource(null);
    setSignatureSaveName("");
  }

  async function applySavedSignature(signature: SavedSignature) {
    if (!active) return;
    setSignatureLibraryBusy(`apply:${signature.id}`); setError(null);
    const response = await fetch(apiPath("/api/create/signatures", workspaceKind, scope), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply", letterheadId: active.id, signatureId: signature.id }),
    });
    const payload = await response.json().catch(() => ({}));
    setSignatureLibraryBusy(null);
    if (!response.ok) {
      if (workspaceKind === "client" && await offerClientStorageRequest(payload.code)) return;
      setError(payload.error || "The saved signature could not be added."); return;
    }
    applyUpdatedLetterhead(payload.letterhead);
  }

  async function deleteSavedSignature(signature: SavedSignature) {
    if (!(await appConfirm(`Delete “${signature.name}” from your saved signature library? Signatures already placed on documents will remain.`))) return;
    setSignatureLibraryBusy(`delete:${signature.id}`); setError(null);
    const response = await fetch(apiPath(`/api/create/signatures/${signature.id}`, workspaceKind, scope), { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setSignatureLibraryBusy(null);
    if (!response.ok) { setError(payload.error || "The saved signature could not be deleted."); return; }
    setSavedSignatures((current) => current.filter((item) => item.id !== signature.id));
  }

  async function openDelivery() {
    if (!active) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!(await persist(active))) return;
    setDeliveryDialogOpen(true); setDeliveryLoading(true); setDeliveryNotice(null); setDeliveryClientId(""); setDeliverySearch("");
    const response = await fetch("/api/admin/clients/directory", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setDeliveryLoading(false);
    if (!response.ok) { setDeliveryNotice(payload.error || "Client accounts could not be loaded."); return; }
    setDeliveryClients((payload.clients || []).filter((client: DeliveryClient) => client.has_platform_account && client.platform_user_id));
  }

  async function deliver() {
    if (!active || !deliveryClientId) return;
    setDeliveryBusy(true); setDeliveryNotice(null);
    const response = await fetch("/api/admin/create/letterheads/deliver", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ letterheadId: active.id, clientId: deliveryClientId }) });
    const payload = await response.json().catch(() => ({}));
    setDeliveryBusy(false);
    if (!response.ok) { setDeliveryNotice(payload.error || "The letterhead could not be delivered."); return; }
    setDeliveryNotice(`Delivered securely to ${payload.delivery?.clientName || "the client"}. They have also received a dashboard notification and email.`);
    setDeliveryClientId("");
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
      const response = await fetch(apiPath(`/api/create/letterheads/${source.id}/duplicate`, workspaceKind, scope), { method: "POST" });
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
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}`, workspaceKind, scope), { method: "DELETE" });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); setError(payload.error || "The document could not be archived."); return; }
    setItems((current) => current.filter((item) => item.id !== active.id));
    setActive(null);
  }

  async function deleteLetterhead(source: Letterhead) {
    if (deletingId) return;
    if (!(await appConfirm(`Delete “${source.title}”? It will be removed from your saved documents.`))) return;
    setDeletingId(source.id);
    setError(null);
    try {
      const response = await fetch(apiPath(`/api/create/letterheads/${source.id}`, workspaceKind, scope), { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "The document could not be deleted.");
        return;
      }
      setItems((current) => current.filter((item) => item.id !== source.id));
      if (active?.id === source.id) setActive(null);
    } catch {
      setError("The document could not be deleted. Check your connection and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  async function refine(mode: string) {
    if (!active) return;
    setRefining(true); setError(null);
    const response = await fetch(apiPath(`/api/create/letterheads/${active.id}/refine`, workspaceKind, scope), {
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
      await fetch(apiPath(`/api/create/letterheads/${active.id}`, workspaceKind, scope), {
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

  async function requestLetterheadDesign() {
    setRequestingDesign(true);
    setError(null);
    try {
      const response = await fetch("/api/create/letterheads/design-request", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The request could not be sent.");
      setDesignRequest({
        invoiceNumber: String(payload.invoice?.invoice_number || ""),
        publicToken: String(payload.invoice?.public_token || ""),
        total: Number(payload.invoice?.total || 0),
        currency: String(payload.invoice?.currency || "NGN"),
        alreadyRequested: Boolean(payload.alreadyRequested),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The request could not be sent.");
    } finally {
      setRequestingDesign(false);
    }
  }

  const previewSource = useMemo<Letterhead | null>(() => active ? {
    ...active,
    // Signature and stamp placement do not change pagination and are painted
    // as interactive overlays. Excluding them prevents an expensive PDF
    // rebuild on every pointer movement while an asset is dragged.
    signatureUrl: null,
    stampUrl: null,
    signatures: active.signatures.map((signature) => ({ ...signature, signatureUrl: null })),
  } : null, [active?.id, active?.bodyHtml, active?.paperSize, active?.bottomMargin, active?.lineSpacing, active?.firstPageUrl, active?.secondPageUrl, active?.hasSecondPage]);

  useEffect(() => {
    if (!previewSource) {
      setPreviewPages([]);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    void (async () => {
      const cacheBase = await previewCacheBase(previewSource, workspaceKind, scope, "exact");
      const cached = await readCachedPreview(cacheBase);
      if (cancelled) return;
      if (cached?.length) {
        const cachedUrls = cached.map((blob) => URL.createObjectURL(blob));
        const previousUrls = previewUrls.current;
        previewUrls.current = cachedUrls;
        setPreviewPages(cachedUrls);
        setPreviewError(null);
        setPreviewBusy(false);
        window.setTimeout(() => previousUrls.forEach((url) => URL.revokeObjectURL(url)), 0);
        return;
      }

      // Let the writer finish a short typing burst before rebuilding every PDF
      // page. This prevents an older render flashing over newer content.
      timer = window.setTimeout(async () => {
        setPreviewBusy(true);
        setPreviewError(null);
        const generatedUrls: string[] = [];
        const generatedBlobs: Blob[] = [];
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
            const blob = await canvasBlob(canvas);
            const objectUrl = URL.createObjectURL(blob);
            generatedBlobs.push(blob);
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
          else if (generatedBlobs.length) void cachePreview(cacheBase, generatedBlobs);
        } catch (previewFailure) {
          console.error("[letterhead preview]", previewFailure);
          generatedUrls.filter((url) => !previewUrls.current.includes(url)).forEach((url) => URL.revokeObjectURL(url));
          if (!cancelled) setPreviewError("The exact PDF preview could not be rendered in this browser. Your document remains saved.");
        } finally {
          await loadingTask?.destroy().catch(() => undefined);
          if (!cancelled) setPreviewBusy(false);
        }
      }, previewUrls.current.length ? 850 : 120);
    })();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [previewSource, scope, workspaceKind]);

  if (loading) return <div className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>;

  if (!active) {
    return (
      <div className="space-y-5">
        {!lockedLetterhead && <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"><ArrowLeft className="h-3.5 w-3.5" />Back to tools</button>}
        <div className={`flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${lockedLetterhead ? "border-slate-200 bg-white" : "border-blue-100 bg-blue-50"}`}>
          <div><h2 className="text-lg font-bold text-[#07133B]">Official documents</h2><p className="mt-1 text-[13px] text-gray-600">Create, reuse, duplicate, sign, and export corporate letters with the approved stationery above.</p></div>
          <button onClick={create} disabled={creating} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-[13px] font-bold text-white hover:bg-[#083EC0] disabled:opacity-60">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}New document</button>
        </div>
        {!lockedLetterhead && <PrivacyNotice />}
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</p>}
        {items.length ? <section>
          <div className="mb-3">
            <h2 className="text-[15px] font-bold text-[#07133B]">Saved letterheads</h2>
            <p className="mt-0.5 text-[12px] text-gray-500">Open, duplicate, or delete a saved document.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
              <button type="button" onClick={() => open(item)} className="block w-full text-left">
                <div className="relative aspect-[16/6] overflow-hidden border-b border-gray-100 bg-[#F3F6FB]">
                  {item.firstPageUrl ? (
                    <SavedLetterheadPreview item={item} workspaceKind={workspaceKind} scope={scope} />
                  ) : (
                    <div className="grid h-full place-items-center text-center"><span><FileText className="mx-auto h-7 w-7 text-blue-300" /><span className="mt-1.5 block text-[10px] font-semibold text-gray-400">Add letterhead artwork</span></span></div>
                  )}
                  <span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-semibold capitalize shadow-sm ${item.status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.status}</span>
                  {item.deliveredByCds && <span className="absolute bottom-3 left-3 rounded-full bg-[#0A4FE8] px-2.5 py-1 text-[9.5px] font-semibold text-white shadow-sm">Delivered by CDS Space</span>}
                </div>
                <div className="px-4 pt-3">
                  <h3 className="truncate text-[14px] font-bold text-[#07133B]">{item.title}</h3>
                  <p className="mt-1 text-[11px] text-gray-400">{item.paperSize.toUpperCase()} · Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
                </div>
              </button>
              <div className="mx-4 mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pb-4 pt-3">
                <button type="button" onClick={() => open(item)} className="flex-1 rounded-lg bg-[#0A4FE8] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#083EC0]">Open</button>
                <button type="button" disabled={Boolean(duplicatingId) || deletingId === item.id} onClick={() => void duplicateLetterhead(item)} className="inline-flex min-w-0 items-center justify-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2 py-2 text-[11px] font-bold text-[#0A4FE8] hover:bg-blue-100 disabled:opacity-60">
                  {duplicatingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}Duplicate
                </button>
                <button type="button" disabled={Boolean(deletingId) || duplicatingId === item.id} onClick={() => void deleteLetterhead(item)} className="inline-flex min-w-0 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60">
                  {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Delete
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
          {workspaceKind === "admin" && <button onClick={() => void openDelivery()} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#0A4FE8] hover:bg-blue-50"><Send className="h-3.5 w-3.5" />Deliver to client</button>}
          <button onClick={archive} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"><Archive className="h-3.5 w-3.5" />Archive</button>
          <button onClick={openExportChoices} disabled={preparingExport || Boolean(exportingSize)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#083EC0] disabled:cursor-wait disabled:opacity-65">{preparingExport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{preparingExport ? "Preparing…" : "Export PDF"}</button>
        </div>
      </div>
      {workspaceKind === "client" && !lockedLetterhead && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          {designRequest ? (
            <div className="text-[12px] text-[#07133B]">
              <p className="font-semibold">
                {designRequest.alreadyRequested
                  ? `You already have a letterhead design request waiting on invoice ${designRequest.invoiceNumber}.`
                  : `Request received. Invoice ${designRequest.invoiceNumber} for ${designRequest.currency} ${designRequest.total.toLocaleString()} is ready.`}
              </p>
              <p className="mt-1 text-[11px] text-[#475467]">
                Design starts once payment is confirmed, and your finished letterhead is delivered within 24 hours and
                appears here automatically.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Payment is the step that actually starts the work, so it is
                    offered here rather than only from the invoices list. */}
                {designRequest.publicToken && (
                  <Link
                    href={`/invoice/${designRequest.publicToken}#payment`}
                    target="_blank"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 text-[11px] font-semibold text-white hover:bg-[#083EC0]"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Pay now
                  </Link>
                )}
                <Link
                  href="/dashboard/invoices"
                  className="inline-flex h-9 items-center rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-50"
                >
                  Open the invoice
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[#07133B]">No letterhead of your own yet?</p>
                <p className="mt-0.5 text-[11px] text-[#475467]">
                  Ask the CDS Space team to design one. We raise the invoice straight away in your billing currency,
                  and your letterhead is delivered within 24 hours of payment.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void requestLetterheadDesign()}
                disabled={requestingDesign}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-semibold text-white hover:bg-[#083EC0] disabled:opacity-60"
              >
                {requestingDesign ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                Request a letterhead design
              </button>
            </div>
          )}
        </div>
      )}
      {workspaceKind === "client" && <ContextualTutorialPrompt tool="official-letterhead" label="the Create letterhead tool" />}
      {!lockedLetterhead && <PrivacyNotice />}
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
        <section className="min-w-0 space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_150px_170px]">
            <label className="text-[12px] font-semibold text-gray-600">Document title<input value={active.title} onChange={(event) => patch({ title: event.target.value })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] outline-none focus:border-blue-300 focus:bg-white" /></label>
            <label className="text-[12px] font-semibold text-gray-600">Paper size<select value={active.paperSize} onChange={(event) => patch({ paperSize: event.target.value === "legal" ? "legal" : "a4" })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] outline-none"><option value="a4">A4 portrait</option><option value="legal">Legal portrait</option></select></label>
            <label className="text-[12px] font-semibold text-gray-600">Line spacing<select value={String(active.lineSpacing ?? 1)} onChange={(event) => patch({ lineSpacing: Number(event.target.value) || 1 })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] outline-none"><option value="1">Single</option><option value="1.15">1.15</option><option value="1.5">One and a half</option><option value="2">Double</option></select></label>
            <label className="text-[12px] font-semibold text-gray-600">Bottom margin<select value={active.bottomMargin} onChange={(event) => patch({ bottomMargin: event.target.value === "small" ? "small" : "wide" })} className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] outline-none"><option value="wide">Wide margin</option><option value="small">Small margin</option></select></label>
          </div>
          {lockedLetterhead ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#0A4FE8]" />
              <p className="text-[11.5px] leading-5 text-[#07133B]">
                <span className="font-semibold">CDS Space letterhead applied.</span>{" "}
                {active.firstPageName
                  ? active.hasSecondPage && active.secondPageName
                    ? "Page one uses the official first-page design, and every additional page uses the approved continuation design."
                    : "Page one uses the official company design. No continuation design was copied into this document, so additional pages use the first-page artwork."
                  : "No company letterhead has been set yet, so this document has plain pages. A super admin can set it from the Executive Board letterhead page."}
              </p>
            </div>
          ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70">
            <button type="button" onClick={() => setLetterheadConfigOpen((value) => !value)} aria-expanded={letterheadConfigOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-[#07133B]">Configure letterhead</span><span className="mt-0.5 block text-[10.5px] text-slate-500">{active.firstPageName && (!active.hasSecondPage || active.secondPageName) ? "Letterhead pages configured" : "Add the first-page and optional continuation designs"}</span></span>{active.firstPageName && (!active.hasSecondPage || active.secondPageName) && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9.5px] font-semibold text-emerald-700">Complete</span>}<ChevronDown className={`h-4 w-4 text-slate-400 transition ${letterheadConfigOpen ? "rotate-180" : ""}`} /></button>
            {letterheadConfigOpen && <div className="space-y-3 border-t border-slate-200 p-4">
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <AssetUpload label="First-page letterhead design" name={active.firstPageName} kind="firstPage" busy={uploading === "firstPage"} onFile={upload} />
                {active.hasSecondPage && <AssetUpload label="Page two and later design" name={active.secondPageName} kind="secondPage" busy={uploading === "secondPage"} onFile={upload} />}
              </div>
              <label className="flex items-center gap-2 border-t border-slate-200 pt-3 text-[12px] font-semibold text-gray-600"><input type="checkbox" checked={active.hasSecondPage} onChange={(event) => patch({ hasSecondPage: event.target.checked })} className="h-4 w-4 rounded border-gray-300 text-[#0A4FE8]" />Use a separate design from page two onward</label>
            </div>}
          </div>
          )}
          {/* On a phone these four sit on one line, small and closely spaced,
              scrolling sideways if the screen is very narrow rather than
              wrapping into a block of chunky buttons. */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-2 sm:p-2.5">
            <span className="block text-[10.5px] font-semibold text-gray-500 sm:text-[11px]">Refine the current document with AI</span>
            <div className="-mx-2 mt-1.5 flex items-center gap-1 overflow-x-auto px-2 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:mt-2 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0">
              {[["improve", "Improve"], ["formalize", "Make formal"], ["concise", "Make concise"], ["proofread", "Proofread"]].map(([mode, label]) => (
                <button
                  key={mode}
                  disabled={refining}
                  onClick={() => refine(mode)}
                  className="shrink-0 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-gray-600 hover:border-blue-200 hover:text-[#0A4FE8] disabled:opacity-50 sm:px-2.5 sm:py-1.5 sm:text-[11px]"
                >
                  {refining ? "Working…" : label}
                </button>
              ))}
            </div>
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
                const stampPageIndex = active.stampPage === "first" ? 0 : previewPages.length - 1;
                const showSignature = Boolean(active.signatureUrl) && index === signaturePageIndex;
                const showStamp = Boolean(active.stampUrl) && index === stampPageIndex;
                const visibleAdditionalSignatures = active.signatures.filter((signature) => signature.signatureUrl && (signature.status === "ready" || signature.status === "signed") && index === (signature.signaturePage === "first" ? 0 : previewPages.length - 1));
                return (
                  <div key={`${active.id}-${index}`}>
                    <p className="mb-1.5 text-center text-[10px] font-semibold text-white/70">Page {index + 1}</p>
                    <div ref={(node) => { if (showSignature) signaturePreviewRef.current = node; if (showStamp) stampPreviewRef.current = node; }} className={`relative mx-auto w-full max-w-[520px] overflow-hidden bg-white shadow-lg transition-opacity ${previewBusy ? "opacity-60" : "opacity-100"}`} style={{ aspectRatio: previewAspect }}>
                      <img src={page} alt={`Exact PDF preview, page ${index + 1}`} className="absolute inset-0 h-full w-full object-fill" />
                      {showSignature && active.signatureUrl && <DraggableSignature active={active} previewRef={signaturePreviewRef} onChange={(signatureX, signatureY) => patch({ signatureX, signatureY })} onRemove={() => void removeAsset("signature")} />}
                      {showStamp && active.stampUrl && <DraggableStamp active={active} previewRef={stampPreviewRef} onChange={(stampX, stampY) => patch({ stampX, stampY })} onRemove={() => void removeAsset("stamp")} />}
                      {visibleAdditionalSignatures.map((signature) => <DraggableAdditionalSignature key={signature.id} signature={signature} onChange={(signatureX, signatureY) => patch({ signatures: active.signatures.map((item) => item.id === signature.id ? { ...item, signatureX, signatureY } : item) })} />)}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-center text-[10px] text-gray-400">Every visible page break is generated by the same layout engine used for export.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <button type="button" onClick={() => setSigningConfigOpen((value) => !value)} aria-expanded={signingConfigOpen} className="flex w-full items-center gap-3 p-4 text-left"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><PenLine className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-bold text-[#07133B]">Configure signatures and seal</span><span className="mt-0.5 block text-[10.5px] text-gray-400">{active.signatureUrl || active.stampUrl || active.signatures.some((signature) => signature.status !== "declined") ? `${Number(Boolean(active.signatureUrl)) + active.signatures.filter((signature) => signature.status === "ready" || signature.status === "signed").length} signature(s) · ${active.signatures.filter((signature) => signature.status === "pending" || signature.status === "opened").length} awaiting` : "Upload, sign live, or invite another signer"}</span></span>{(active.signatureUrl || active.stampUrl || active.signatures.some((signature) => signature.status !== "declined")) && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9.5px] font-semibold text-emerald-700">Configured</span>}<ChevronDown className={`h-4 w-4 text-slate-400 transition ${signingConfigOpen ? "rotate-180" : ""}`} /></button>
            {signingConfigOpen && <div className="border-t border-gray-100 p-4">
              <p className="text-[11px] text-gray-400">Upload or paste a signature, sign live with cSign, upload several signatures together, or securely invite another person.</p>
              <div className="mt-3"><AssetUpload label="Primary signature image" name={active.signatureName} kind="signature" busy={uploading === "signature"} onFile={upload} paste /></div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => setSignatureDialogOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-100"><PenLine className="h-4 w-4" />Sign live</button>
                <button type="button" onClick={() => multipleSignatureInput.current?.click()} disabled={uploading === "signature"} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-[11px] font-semibold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-50">{uploading === "signature" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload multiple</button>
                <button type="button" onClick={() => { setInviteResult(null); setInviteDialogOpen(true); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-3 text-[11px] font-semibold text-white hover:bg-[#083EC0]"><Users className="h-4 w-4" />Invite signer</button>
              </div>
              <input ref={multipleSignatureInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(event) => { if (event.target.files?.length) void uploadMultipleSignatures(event.target.files); event.currentTarget.value = ""; }} />

              {active.signatureUrl && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#07133B]">Primary signature</span>
                  <span className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => openSaveSignature({ kind: "primary" })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 text-[10px] font-semibold text-[#0A4FE8] hover:bg-blue-50"><Bookmark className="h-3.5 w-3.5" />Save for later</button>
                    <button type="button" onClick={() => void removeAsset("signature")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3"><label className="text-[11px] font-semibold text-gray-600">Page<select value={active.signaturePage} onChange={(event) => patch({ signaturePage: event.target.value === "first" ? "first" : "last" })} className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-[11px]"><option value="last">Last page</option><option value="first">First page</option></select></label><label className="text-[11px] font-semibold text-gray-600">Size<input type="range" min="8" max="50" value={active.signatureWidth} onChange={(event) => patch({ signatureWidth: Number(event.target.value) })} className="mt-3 w-full accent-[#0A4FE8]" /></label></div>
              </div>}

              {active.signatures.length > 0 && <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between"><h3 className="text-[11.5px] font-semibold text-[#07133B]">Additional signers</h3><button type="button" onClick={() => void refreshActiveSignatures()} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#0A4FE8]"><RefreshCw className="h-3.5 w-3.5" />Refresh status</button></div>
                {active.signatures.map((signature) => <div key={signature.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3"><span className="min-w-0"><strong className="block truncate text-[11px] text-[#07133B]">{signature.signerName || signature.signerEmail || "Uploaded signature"}</strong><span className="text-[10px] capitalize text-slate-500">{signature.status === "ready" ? "Ready" : signature.status}</span></span>{signature.shareUrl && (signature.status === "pending" || signature.status === "opened") && <UniversalShareButton title={`Signature request for ${active.title}`} text={`Please review and sign ${active.title} securely on CDS Space.`} url={signature.shareUrl} label="Share link" className="h-8 min-h-8 px-2 text-[10px]" />}</div>
                  {signature.signatureUrl && <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] font-semibold text-slate-600">Page<select value={signature.signaturePage} onChange={(event) => patch({ signatures: active.signatures.map((item) => item.id === signature.id ? { ...item, signaturePage: event.target.value === "first" ? "first" : "last" } : item) })} className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px]"><option value="last">Last page</option><option value="first">First page</option></select></label><label className="text-[10px] font-semibold text-slate-600">Size<input type="range" min="8" max="50" value={signature.signatureWidth} onChange={(event) => patch({ signatures: active.signatures.map((item) => item.id === signature.id ? { ...item, signatureWidth: Number(event.target.value) } : item) })} className="mt-2.5 w-full accent-[#0A4FE8]" /></label></div>}
                  <div className="mt-2 flex justify-end gap-1.5">
                    {signature.signatureUrl && <button type="button" onClick={() => openSaveSignature({ kind: "additional", id: signature.id, suggestedName: signature.signerName || signature.signerEmail || "Saved signature" })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 text-[10px] font-semibold text-[#0A4FE8] hover:bg-blue-50"><Bookmark className="h-3.5 w-3.5" />Save</button>}
                    <button type="button" disabled={signatureLibraryBusy === `remove:${signature.id}`} onClick={() => void removeAdditionalSignature(signature)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">{signatureLibraryBusy === `remove:${signature.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}{signature.status === "pending" || signature.status === "opened" ? "Cancel request" : "Delete"}</button>
                  </div>
                </div>)}
              </div>}

              {(active.signatureUrl || active.signatures.length > 0) && <button type="button" disabled={signatureLibraryBusy === "remove-all"} onClick={() => void removeAllSignatures()} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[10.5px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">{signatureLibraryBusy === "remove-all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Remove all signatures</button>}

              <div className="my-4 border-t border-gray-100" />
              <div className="flex items-center gap-2"><Library className="h-4 w-4 text-[#0A4FE8]" /><h3 className="text-[12px] font-semibold text-[#07133B]">Saved signatures</h3></div>
              <p className="mt-1 text-[11px] text-gray-400">Private named signatures you can reuse on new Create Studio documents.</p>
              {savedSignatures.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{savedSignatures.map((signature) => <div key={signature.id} className="rounded-xl border border-slate-200 bg-white p-2.5"><div className="flex h-14 items-center justify-center rounded-lg bg-slate-50 p-2"><img src={signature.assetUrl} alt={`${signature.name} signature`} className="max-h-full max-w-full object-contain" /></div><p className="mt-2 truncate text-[10.5px] font-semibold text-[#07133B]">{signature.name}</p><div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5"><button type="button" disabled={Boolean(signatureLibraryBusy)} onClick={() => void applySavedSignature(signature)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#0A4FE8] px-2 text-[10px] font-semibold text-white hover:bg-[#083EC0] disabled:opacity-50">{signatureLibraryBusy === `apply:${signature.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}Use signature</button><button type="button" disabled={Boolean(signatureLibraryBusy)} onClick={() => void deleteSavedSignature(signature)} aria-label={`Delete saved signature ${signature.name}`} className="grid h-8 w-8 place-items-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50">{signatureLibraryBusy === `delete:${signature.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></div></div>)}</div> : <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[10.5px] text-slate-500">Save a current signature here to reuse it on future documents.</div>}

              <div className="my-4 border-t border-gray-100" />
              <div className="flex items-center gap-2"><Stamp className="h-4 w-4 text-[#0A4FE8]" /><h3 className="text-[12px] font-semibold text-[#07133B]">Company stamp / seal</h3></div>
              <p className="mt-1 text-[11px] text-gray-400">Upload or paste a transparent stamp or seal image, then drag it anywhere on the preview just like the signatures.</p>
              <div className="mt-3"><AssetUpload label="Stamp or seal image" name={active.stampName} kind="stamp" busy={uploading === "stamp"} onFile={upload} paste /></div>
              {active.stampUrl && <div className="mt-3"><div className="mb-2 flex justify-end"><button type="button" onClick={() => void removeAsset("stamp")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete seal</button></div><div className="grid grid-cols-2 gap-3"><label className="text-[11px] font-semibold text-gray-600">Place on<select value={active.stampPage} onChange={(event) => patch({ stampPage: event.target.value === "first" ? "first" : "last" })} className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-[11px]"><option value="last">Last page</option><option value="first">First page</option></select></label><label className="text-[11px] font-semibold text-gray-600">Size<input type="range" min="8" max="50" value={active.stampWidth} onChange={(event) => patch({ stampWidth: Number(event.target.value) })} className="mt-3 w-full accent-[#0A4FE8]" /></label></div></div>}
            </div>}
          </div>
        </aside>
      </div>

      <Dialog open={Boolean(signatureSaveSource)} onOpenChange={(open) => { if (!open && signatureLibraryBusy !== "save") { setSignatureSaveSource(null); setSignatureSaveName(""); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Save signature for later</DialogTitle><DialogDescription>Give this private signature a clear name. It will appear in your saved signature library on every new Create Studio letterhead.</DialogDescription></DialogHeader>
          <div className="mt-3 space-y-3">
            <label className="block text-[11.5px] font-semibold text-gray-600">Signature name<input value={signatureSaveName} onChange={(event) => setSignatureSaveName(event.target.value)} maxLength={80} autoFocus placeholder="For example, Chris O. John" className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 px-3 text-[12px] outline-none focus:border-[#0A4FE8]" /></label>
            <button type="button" disabled={!signatureSaveName.trim() || signatureLibraryBusy === "save"} onClick={() => void saveSignatureToLibrary()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-semibold text-white hover:bg-[#083EC0] disabled:opacity-50">{signatureLibraryBusy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}{signatureLibraryBusy === "save" ? "Saving signature…" : "Save signature"}</button>
          </div>
        </DialogContent>
      </Dialog>
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
      <Dialog open={signatureDialogOpen} onOpenChange={(open) => { if (!uploading) setSignatureDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader><DialogTitle>Sign live with cSign</DialogTitle><DialogDescription>Draw a private signature for this letterhead. It is security-checked and stored with the same protected document assets.</DialogDescription></DialogHeader>
          <div className="mt-3"><LiveSignaturePad busy={uploading === "signature"} onSave={async (file) => { await upload("signature", file); setSignatureDialogOpen(false); }} /></div>
        </DialogContent>
      </Dialog>
      <Dialog open={inviteDialogOpen} onOpenChange={(open) => { if (!inviteBusy) setInviteDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Invite another person to sign</DialogTitle>
            <DialogDescription>CDS Space creates a private signing link and emails it to the signer. They can draw their signature with cSign without accessing your dashboard.</DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-3">
            <label className="block text-[11.5px] font-semibold text-gray-600">Signer name <span className="font-normal text-gray-400">(optional)</span><input value={inviteName} onChange={(event) => setInviteName(event.target.value)} autoComplete="name" placeholder="Full name" className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 px-3 text-[12px] outline-none focus:border-[#0A4FE8]" /></label>
            <label className="block text-[11.5px] font-semibold text-gray-600">Signer email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 px-3 text-[12px] outline-none focus:border-[#0A4FE8]" /></label>
            {inviteResult ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-[12px] font-semibold text-emerald-900">Signature request created</p>
                <p className="mt-1 text-[11px] leading-5 text-emerald-800">{inviteResult.emailed ? "The secure signing link was emailed successfully." : "The email could not be sent, but the secure link is ready to share manually."}</p>
                <UniversalShareButton title={`Signature request for ${active.title}`} text={`Please review and sign ${active.title} securely on CDS Space.`} url={inviteResult.shareUrl} label="Share signing link" className="mt-3 w-full" />
              </div>
            ) : (
              <button type="button" disabled={inviteBusy || !inviteEmail.trim()} onClick={() => void inviteSigner()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-[12px] font-semibold text-white hover:bg-[#083EC0] disabled:opacity-50">{inviteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{inviteBusy ? "Creating secure request…" : "Send signature request"}</button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={deliveryDialogOpen} onOpenChange={(open) => { if (!deliveryBusy) setDeliveryDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader><DialogTitle>Deliver letterhead to a client</DialogTitle><DialogDescription>A protected client-owned copy will appear in Create Studio with the “Delivered by CDS Space” tag. Admin storage links are never shared.</DialogDescription></DialogHeader>
          <div className="mt-3 space-y-3">
            <label className="block text-[11.5px] font-semibold text-gray-600">Search client accounts<input value={deliverySearch} onChange={(event) => setDeliverySearch(event.target.value)} placeholder="Search by client, company, or email" className="mt-1.5 h-10 w-full rounded-xl border border-gray-200 px-3 text-[12px] outline-none focus:border-[#0A4FE8]" /></label>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-2">
              {deliveryLoading ? <div className="grid min-h-28 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-[#0A4FE8]" /></div> : deliveryClients.filter((client) => `${client.name} ${client.brand_name || ""} ${client.email || ""}`.toLowerCase().includes(deliverySearch.toLowerCase())).map((client) => (
                <button key={client.platform_user_id} type="button" onClick={() => setDeliveryClientId(client.platform_user_id || "")} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left ${deliveryClientId === client.platform_user_id ? "border-[#0A4FE8] bg-blue-50" : "border-transparent bg-white hover:border-blue-200"}`}><span className="min-w-0"><strong className="block truncate text-[12px] text-[#07133B]">{client.brand_name || client.name}</strong><span className="mt-0.5 block truncate text-[10.5px] text-gray-500">{client.email}</span></span>{deliveryClientId === client.platform_user_id && <Check className="h-4 w-4 shrink-0 text-[#0A4FE8]" />}</button>
              ))}
            </div>
            {deliveryNotice && <p className={`rounded-xl px-3 py-2.5 text-[11.5px] ${deliveryNotice.startsWith("Delivered") ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-rose-200 bg-rose-50 text-rose-700"}`}>{deliveryNotice}</p>}
            <button type="button" disabled={!deliveryClientId || deliveryBusy} onClick={() => void deliver()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-[12px] font-semibold text-white hover:bg-[#083EC0] disabled:opacity-50">{deliveryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{deliveryBusy ? "Delivering secure copy…" : "Deliver letterhead"}</button>
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
      <button type="button" onClick={() => input.current?.click()} onPaste={pasted} className="flex min-h-20 min-w-0 flex-1 items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-left hover:border-blue-300 hover:bg-blue-50/40">{busy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#0A4FE8]" /> : name ? <Check className="h-5 w-5 shrink-0 text-emerald-600" /> : <Upload className="h-5 w-5 shrink-0 text-[#0A4FE8]" />}<span className="min-w-0"><span className="block truncate text-[11.5px] font-semibold text-[#07133B]">{name || (paste ? `Upload or paste ${label.toLowerCase().replace(" image", "")}` : "Upload JPG, PNG, PDF, or SVG")}</span><span className="block text-[10px] text-gray-400">Up to 5MB</span></span></button>
      <button type="button" onClick={() => void pasteFromClipboard()} disabled={busy} className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-3 text-[10.5px] font-semibold text-[#0A4FE8] hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50" aria-label={`Paste ${label.toLowerCase()} from clipboard`}>
        <ClipboardPaste className="h-4 w-4" />
        Click to paste
      </button>
    </div>
    {pasteNote && <p className="mt-1.5 text-[10.5px] leading-4 text-amber-700">{pasteNote}</p>}
    <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(kind, file); event.currentTarget.value = ""; }} />
  </div>;
}

function DraggableSignature({ active, previewRef, onChange, onRemove }: { active: Letterhead; previewRef: React.RefObject<HTMLDivElement | null>; onChange: (x: number, y: number) => void; onRemove: () => void }) {
  const [selected, setSelected] = useState(false);
  const dragged = useRef(false);

  function pointerDown(event: React.PointerEvent<HTMLImageElement>) {
    const frame = previewRef.current;
    if (!frame) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = frame.getBoundingClientRect();
    const start = { pointerX: event.clientX, pointerY: event.clientY, x: active.signatureX, y: active.signatureY };
    dragged.current = false;
    const move = (next: PointerEvent) => {
      // A small wobble is a click, not a drag: only real movement counts, so
      // tapping the signature still opens its controls.
      if (Math.abs(next.clientX - start.pointerX) > 3 || Math.abs(next.clientY - start.pointerY) > 3) dragged.current = true;
      const x = Math.max(0, Math.min(100 - active.signatureWidth, start.x + ((next.clientX - start.pointerX) / bounds.width) * 100));
      const y = Math.max(0, Math.min(92, start.y + ((next.clientY - start.pointerY) / bounds.height) * 100));
      onChange(x, y);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!dragged.current) setSelected((value) => !value);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      className="absolute z-10"
      style={{ left: `${active.signatureX}%`, top: `${active.signatureY}%`, width: `${active.signatureWidth}%` }}
    >
      <img
        src={active.signatureUrl || ""}
        alt="Signature"
        onPointerDown={pointerDown}
        className={`w-full cursor-grab touch-none object-contain active:cursor-grabbing ${selected ? "rounded-sm outline-dashed outline-2 outline-offset-2 outline-[#0A4FE8]" : ""}`}
      />
      {selected && (
        <button
          type="button"
          onClick={() => { setSelected(false); onRemove(); }}
          aria-label="Remove this signature"
          title="Remove this signature"
          className="absolute -right-2.5 -top-2.5 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function DraggableStamp({ active, previewRef, onChange, onRemove }: { active: Letterhead; previewRef: React.RefObject<HTMLDivElement | null>; onChange: (x: number, y: number) => void; onRemove: () => void }) {
  const [selected, setSelected] = useState(false);
  const dragged = useRef(false);

  function pointerDown(event: React.PointerEvent<HTMLImageElement>) {
    const frame = previewRef.current;
    if (!frame) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = frame.getBoundingClientRect();
    const start = { pointerX: event.clientX, pointerY: event.clientY, x: active.stampX, y: active.stampY };
    dragged.current = false;
    const move = (next: PointerEvent) => {
      if (Math.abs(next.clientX - start.pointerX) > 3 || Math.abs(next.clientY - start.pointerY) > 3) dragged.current = true;
      const x = Math.max(0, Math.min(100 - active.stampWidth, start.x + ((next.clientX - start.pointerX) / bounds.width) * 100));
      const y = Math.max(0, Math.min(92, start.y + ((next.clientY - start.pointerY) / bounds.height) * 100));
      onChange(x, y);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!dragged.current) setSelected((value) => !value);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      className="absolute z-20"
      style={{ left: `${active.stampX}%`, top: `${active.stampY}%`, width: `${active.stampWidth}%` }}
    >
      <img
        src={active.stampUrl || ""}
        alt="Company stamp or seal"
        onPointerDown={pointerDown}
        className={`w-full cursor-grab touch-none object-contain active:cursor-grabbing ${selected ? "rounded-sm outline-dashed outline-2 outline-offset-2 outline-[#0A4FE8]" : ""}`}
      />
      {selected && (
        <button
          type="button"
          onClick={() => { setSelected(false); onRemove(); }}
          aria-label="Remove this seal"
          title="Remove this seal"
          className="absolute -right-2.5 -top-2.5 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function DraggableAdditionalSignature({ signature, onChange }: { signature: AdditionalSignature; onChange: (x: number, y: number) => void }) {
  function pointerDown(event: React.PointerEvent<HTMLImageElement>) {
    const frame = event.currentTarget.parentElement;
    if (!frame) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = frame.getBoundingClientRect();
    const start = { pointerX: event.clientX, pointerY: event.clientY, x: signature.signatureX, y: signature.signatureY };
    const move = (next: PointerEvent) => {
      const x = Math.max(0, Math.min(100 - signature.signatureWidth, start.x + ((next.clientX - start.pointerX) / bounds.width) * 100));
      const y = Math.max(0, Math.min(92, start.y + ((next.clientY - start.pointerY) / bounds.height) * 100));
      onChange(x, y);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  return <img src={signature.signatureUrl || ""} alt={`Signature${signature.signerName ? ` for ${signature.signerName}` : ""}`} onPointerDown={pointerDown} className="absolute z-10 cursor-grab touch-none object-contain active:cursor-grabbing" style={{ left: `${signature.signatureX}%`, top: `${signature.signatureY}%`, width: `${signature.signatureWidth}%` }} />;
}
