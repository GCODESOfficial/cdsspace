"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Expand, ExternalLink, FileText, Loader2, Minimize2, Minus, Plus, Printer } from "lucide-react";
import { trackPublicationEvent } from "./PublicationTracker";

interface Props {
  slug: string;
  title: string;
  pageCount: number | null;
  accessMode: "view" | "download" | "download_print";
  publicationType?: string | null;
  initialPreviewUrl?: string | null;
  token?: string;
}

const MAX_RENDERED_PAGES = 10;

function documentCopy(publicationType?: string | null) {
  const type = (publicationType || "").toLowerCase();
  if (type.includes("case study")) return { heading: "Read the full case study", noun: "case study" };
  if (type.includes("audit")) return { heading: "Read the full audit", noun: "audit" };
  if (type.includes("assessment")) return { heading: "Read the full assessment", noun: "assessment" };
  if (type.includes("scorecard")) return { heading: "Read the full scorecard", noun: "scorecard" };
  if (type.includes("benchmark")) return { heading: "Read the full benchmark", noun: "benchmark" };
  if (type.includes("brief")) return { heading: "Read the full brief", noun: "brief" };
  if (type.includes("research note")) return { heading: "Read the full research note", noun: "research note" };
  return { heading: "Read the full report", noun: "report" };
}

function imageSnapshot(images: Map<number, string>) {
  return Object.fromEntries(images.entries()) as Record<number, string>;
}

export default function IntelligencePdfViewer({ slug, title, pageCount, accessMode, publicationType, initialPreviewUrl, token }: Props) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [renderedPages, setRenderedPages] = useState<Record<number, string>>(() => initialPreviewUrl ? { 1: initialPreviewUrl } : {});
  const [renderingPages, setRenderingPages] = useState<Set<number>>(new Set());
  const [pageErrors, setPageErrors] = useState<Set<number>>(new Set());
  const [pageAspects, setPageAspects] = useState<Record<number, number>>({});
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [resolvedPageCount, setResolvedPageCount] = useState(pageCount);
  const [documentReady, setDocumentReady] = useState(0);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pageElements = useRef<Map<number, HTMLDivElement>>(new Map());
  const pdfDocument = useRef<any>(null);
  const renderPdfPage = useRef<null | ((pdf: any, pageNumber: number, options: { width: number; toDataURL: true }) => Promise<string>)>(null);
  const pageImages = useRef<Map<number, string>>(new Map(initialPreviewUrl ? [[1, initialPreviewUrl]] : []));
  const pageRenders = useRef<Map<number, Promise<string>>>(new Map());
  const documentSession = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const lastTrackedPage = useRef(1);
  const query = token ? `&token=${encodeURIComponent(token)}` : "";
  const documentUrl = `/api/intelligence/${encodeURIComponent(slug)}/document?mode=preview${query}`;
  const copy = documentCopy(publicationType);
  const visiblePageCount = resolvedPageCount || pageCount || 1;

  useEffect(() => {
    trackPublicationEvent(slug, "pdf_open");
  }, [slug]);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    let active = true;
    const session = ++documentSession.current;
    setPage(1);
    setViewerError(null);
    setDocumentLoading(true);
    setResolvedPageCount(pageCount);
    setRenderedPages(initialPreviewUrl ? { 1: initialPreviewUrl } : {});
    setRenderingPages(new Set());
    setPageErrors(new Set());
    setPageAspects({});
    pageImages.current = new Map(initialPreviewUrl ? [[1, initialPreviewUrl]] : []);
    pageRenders.current.clear();
    lastTrackedPage.current = 1;

    import("unpdf")
      .then(async ({ getDocumentProxy, renderPageAsImage }) => {
        // URL loading lets PDF.js request only the byte ranges needed by pages
        // approaching the viewport instead of downloading the whole document.
        const pdf = await getDocumentProxy(undefined as never, {
          url: documentUrl,
          withCredentials: true,
          rangeChunkSize: 1024 * 1024,
          disableStream: true,
          disableAutoFetch: true,
        } as any);
        if (!active || session !== documentSession.current) { await pdf.destroy(); return; }
        pdfDocument.current = pdf;
        renderPdfPage.current = renderPageAsImage;
        setResolvedPageCount(pdf.numPages || pageCount);
        setDocumentReady((current) => current + 1);
        setDocumentLoading(false);
      })
      .catch(() => {
        if (active && session === documentSession.current) {
          setViewerError(`We could not render this ${copy.noun}.`);
          setDocumentLoading(false);
        }
      });

    return () => {
      active = false;
      documentSession.current += 1;
      const pdf = pdfDocument.current;
      pdfDocument.current = null;
      renderPdfPage.current = null;
      pageRenders.current.clear();
      if (pdf?.destroy) void pdf.destroy();
    };
  }, [copy.noun, documentUrl, initialPreviewUrl, pageCount]);

  const ensurePage = useCallback((pageNumber: number) => {
    if (!documentReady || !pdfDocument.current || !renderPdfPage.current || pageNumber < 1) return Promise.resolve("");
    const knownCount = resolvedPageCount || pageCount;
    if (knownCount && pageNumber > knownCount) return Promise.resolve("");
    const cached = pageImages.current.get(pageNumber);
    if (cached) return Promise.resolve(cached);
    const pending = pageRenders.current.get(pageNumber);
    if (pending) return pending;

    const session = documentSession.current;
    setRenderingPages((current) => new Set(current).add(pageNumber));
    setPageErrors((current) => {
      if (!current.has(pageNumber)) return current;
      const next = new Set(current);
      next.delete(pageNumber);
      return next;
    });

    const render = renderPdfPage.current(pdfDocument.current, pageNumber, { width: 1200, toDataURL: true })
      .then((image) => {
        if (session !== documentSession.current) return image;
        pageImages.current.set(pageNumber, image);

        // Keep a bounded working set. Pages retain their measured aspect ratio,
        // so unloading a distant bitmap does not make the scroll position jump.
        while (pageImages.current.size > MAX_RENDERED_PAGES) {
          const candidate = [...pageImages.current.keys()]
            .filter((item) => item !== 1 && item !== pageNumber)
            .sort((a, b) => Math.abs(b - pageNumber) - Math.abs(a - pageNumber))[0];
          if (!candidate) break;
          pageImages.current.delete(candidate);
        }
        setRenderedPages(imageSnapshot(pageImages.current));
        return image;
      })
      .catch((error) => {
        if (session === documentSession.current) {
          setPageErrors((current) => new Set(current).add(pageNumber));
        }
        throw error;
      })
      .finally(() => {
        pageRenders.current.delete(pageNumber);
        if (session === documentSession.current) {
          setRenderingPages((current) => {
            const next = new Set(current);
            next.delete(pageNumber);
            return next;
          });
        }
      });
    pageRenders.current.set(pageNumber, render);
    return render;
  }, [documentReady, pageCount, resolvedPageCount]);

  useEffect(() => {
    if (!documentReady) return;
    void ensurePage(1).catch(() => {});
    if (visiblePageCount > 1) void ensurePage(2).catch(() => {});
  }, [documentReady, ensurePage, visiblePageCount]);

  useEffect(() => {
    const root = viewport.current;
    if (!documentReady || !root) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNumber = Number((entry.target as HTMLElement).dataset.pdfPage);
        if (pageNumber) void ensurePage(pageNumber).catch(() => {});
      }
    }, { root, rootMargin: "900px 0px", threshold: 0.01 });
    pageElements.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [documentReady, ensurePage, visiblePageCount]);

  const trackPage = useCallback((nextPage: number) => {
    if (lastTrackedPage.current === nextPage) return;
    lastTrackedPage.current = nextPage;
    trackPublicationEvent(slug, "pdf_page", nextPage);
  }, [slug]);

  const syncPageFromScroll = useCallback(() => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const root = viewport.current;
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      const readingLine = rootRect.top + Math.min(rootRect.height * 0.35, 260);
      let closestPage = 1;
      let closestDistance = Number.POSITIVE_INFINITY;
      pageElements.current.forEach((element, pageNumber) => {
        const rect = element.getBoundingClientRect();
        const distance = readingLine < rect.top ? rect.top - readingLine : readingLine > rect.bottom ? readingLine - rect.bottom : 0;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = pageNumber;
        }
      });
      setPage((current) => {
        if (current === closestPage) return current;
        trackPage(closestPage);
        return closestPage;
      });
    });
  }, [trackPage]);

  useEffect(() => () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
  }, []);

  function changePage(next: number) {
    const bounded = Math.max(1, Math.min(visiblePageCount, next));
    setPage(bounded);
    trackPage(bounded);
    void ensurePage(bounded).catch(() => {});
    requestAnimationFrame(() => {
      const root = viewport.current;
      const target = pageElements.current.get(bounded);
      if (root && target) root.scrollTo({ top: Math.max(0, target.offsetTop - 16), behavior: "smooth" });
    });
  }

  async function enterFullscreen() {
    if (!frame.current || document.fullscreenElement === frame.current) return;
    await frame.current.requestFullscreen();
  }

  async function exitFullscreen() {
    if (!document.fullscreenElement) return;
    await document.exitFullscreen();
  }

  function rememberAspect(pageNumber: number, image: HTMLImageElement) {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const aspect = image.naturalWidth / image.naturalHeight;
    setPageAspects((current) => current[pageNumber] === aspect ? current : { ...current, [pageNumber]: aspect });
  }

  function recoverImage(pageNumber: number, source: string) {
    pageImages.current.delete(pageNumber);
    setRenderedPages(imageSnapshot(pageImages.current));
    if (pageNumber === 1 && source === initialPreviewUrl) void ensurePage(1).catch(() => {});
    else setPageErrors((current) => new Set(current).add(pageNumber));
  }

  return (
    <section className="mt-12 overflow-hidden rounded-[16px] border border-brand-stroke bg-white shadow-[0_20px_60px_rgba(4,11,55,.06)]" aria-labelledby="report-document-heading">
      <div className="flex flex-col gap-4 border-b border-brand-stroke px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-blue-50 text-brand-blue"><FileText className="size-5" /></span>
          <div><h2 id="report-document-heading" className="text-[16px] font-bold text-brand-navy">{copy.heading}</h2><p className="mt-1 text-[12px] text-brand-body/65">{visiblePageCount ? `${visiblePageCount} pages · ` : ""}Scroll to continue reading</p></div>
        </div>
      </div>

      <div ref={frame} className="bg-[#111827]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#081229] px-3 py-2 text-white sm:px-4">
          <div className="flex items-center gap-1">
            <button onClick={() => changePage(page - 1)} disabled={page <= 1} aria-label="Previous page" className="rounded-[4px] p-2 hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="size-4" /></button>
            <label className="flex items-center gap-2 text-[12px]">Page <input value={page} onChange={(event) => changePage(Number(event.target.value) || 1)} className="w-12 rounded-[4px] border border-white/20 bg-white/10 px-2 py-1 text-center outline-none" aria-label="Current page" /> {visiblePageCount ? `of ${visiblePageCount}` : ""}</label>
            <button onClick={() => changePage(page + 1)} disabled={page >= visiblePageCount} aria-label="Next page" className="rounded-[4px] p-2 hover:bg-white/10 disabled:opacity-30"><ChevronRight className="size-4" /></button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(Math.max(50, zoom - 25))} aria-label="Zoom out" className="rounded-[4px] p-2 hover:bg-white/10"><Minus className="size-4" /></button>
            <span className="min-w-12 text-center text-[11px]">{zoom}%</span>
            <button onClick={() => setZoom(Math.min(200, zoom + 25))} aria-label="Zoom in" className="rounded-[4px] p-2 hover:bg-white/10"><Plus className="size-4" /></button>
            {isFullscreen ? <button onClick={() => void exitFullscreen()} aria-label="Exit full screen" className="inline-flex items-center gap-2 rounded-[6px] bg-white px-3 py-2 text-[11px] font-extrabold text-[#081229] shadow-sm transition hover:bg-blue-50"><Minimize2 className="size-4" />Exit full screen</button> : <button onClick={() => void enterFullscreen()} aria-label="Full screen" className="rounded-[4px] p-2 hover:bg-white/10"><Expand className="size-4" /></button>}
            <a href={`/api/intelligence/${encodeURIComponent(slug)}/document?mode=view${query}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${copy.noun} in a new tab`} className="rounded-[4px] p-2 hover:bg-white/10"><ExternalLink className="size-4" /></a>
            {accessMode !== "view" && <a href={`/api/intelligence/${encodeURIComponent(slug)}/document?mode=download${query}`} aria-label={`Download ${copy.noun}`} className="rounded-[4px] p-2 hover:bg-white/10"><Download className="size-4" /></a>}
            {accessMode === "download_print" && <a href={`/api/intelligence/${encodeURIComponent(slug)}/document?mode=print${query}`} target="_blank" rel="noopener noreferrer" aria-label={`Print ${copy.noun}`} className="rounded-[4px] p-2 hover:bg-white/10"><Printer className="size-4" /></a>}
          </div>
        </div>

        <div ref={viewport} onScroll={syncPageFromScroll} className={`relative w-full overflow-auto bg-[#D8DCE3] p-4 sm:p-6 ${isFullscreen ? "h-[calc(100vh-49px)] min-h-0" : "h-[76vh] min-h-[560px]"}`} aria-busy={documentLoading}>
          {documentLoading && !renderedPages[1] && <div className="absolute inset-0 z-20 grid place-items-center bg-[#202938]"><div className="text-center text-white"><Loader2 className="mx-auto size-7 animate-spin" /><p className="mt-3 text-[12px] text-white/65">Loading secure {copy.noun}…</p></div></div>}
          {viewerError ? <div className="grid min-h-full place-items-center text-center"><div><FileText className="mx-auto size-9 text-brand-body/30" /><p className="mt-3 text-[12px] font-semibold text-brand-navy">{viewerError}</p><a href={documentUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-[11px] font-semibold text-brand-blue hover:underline">Open the document in a new tab</a></div></div> : <div className="mx-auto flex min-w-full flex-col gap-5">
            {Array.from({ length: visiblePageCount }, (_, index) => index + 1).map((pageNumber) => {
              const source = renderedPages[pageNumber];
              const aspect = pageAspects[pageNumber];
              const hasError = pageErrors.has(pageNumber);
              return <div key={pageNumber} ref={(element) => { if (element) pageElements.current.set(pageNumber, element); else pageElements.current.delete(pageNumber); }} data-pdf-page={pageNumber} className="relative flex min-h-[360px] w-full scroll-mt-4 flex-col items-center justify-center sm:min-h-[480px]">
                <div className={`relative mx-auto grid place-items-center overflow-hidden bg-white shadow-[0_12px_36px_rgba(4,11,55,.22)] ${aspect ? "" : "min-h-[340px] sm:min-h-[460px]"}`} style={{ width: `${zoom}%`, ...(aspect ? { aspectRatio: aspect } : {}) }}>
                  {source ? <img src={source} alt={`${title}, page ${pageNumber}`} onLoad={(event) => rememberAspect(pageNumber, event.currentTarget)} onError={() => recoverImage(pageNumber, source)} className="block h-auto w-full bg-white" /> : hasError ? <div className="p-8 text-center"><FileText className="mx-auto size-8 text-brand-body/25" /><p className="mt-3 text-[12px] font-semibold text-brand-navy">Page {pageNumber} could not be rendered.</p><button onClick={() => void ensurePage(pageNumber).catch(() => {})} className="mt-3 text-[11px] font-semibold text-brand-blue hover:underline">Try again</button></div> : <div className="p-8 text-center text-brand-body/55"><Loader2 className={`mx-auto size-6 ${renderingPages.has(pageNumber) ? "animate-spin" : ""}`} /><p className="mt-3 text-[11px]">Preparing page {pageNumber}…</p></div>}
                </div>
                <span className="mt-2 rounded-full bg-[#081229]/80 px-2.5 py-1 text-[9px] font-semibold text-white">Page {pageNumber} of {visiblePageCount}</span>
              </div>;
            })}
          </div>}
        </div>
      </div>
    </section>
  );
}
