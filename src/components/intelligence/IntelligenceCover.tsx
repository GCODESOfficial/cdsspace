"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { loadIntelligencePdf } from "@/lib/intelligence/clientPdf";

type Props = {
  slug: string;
  title: string;
  coverUrl?: string | null;
  hasPdf?: boolean;
  token?: string | null;
  eager?: boolean;
  className?: string;
};

const generatedCoverCache = new Map<string, Promise<string>>();

function generatePdfCover(source: string) {
  const cached = generatedCoverCache.get(source);
  if (cached) return cached;
  const task = Promise.all([
        import("unpdf"),
        loadIntelligencePdf(source),
      ]).then(([{ renderPageAsImage }, bytes]) =>
        renderPageAsImage(bytes.slice(), 1, { width: 960, toDataURL: true }),
      );
  generatedCoverCache.set(source, task);
  task.catch(() => generatedCoverCache.delete(source));
  return task;
}

/**
 * Publication artwork with a deterministic PDF-first fallback.
 *
 * Uploaded artwork always wins. When it is absent, the same-origin secure PDF
 * route displays page one without controls so the document itself becomes the
 * publication cover. The iframe cannot capture pointer events, so cards remain
 * fully clickable.
 */
export default function IntelligenceCover({
  slug,
  title,
  coverUrl,
  hasPdf = false,
  token,
  eager = false,
  className = "",
}: Props) {
  const accessToken = token ? `&token=${encodeURIComponent(token)}` : "";
  const source = `/api/intelligence/${encodeURIComponent(slug)}/document?mode=preview${accessToken}`;
  const [generatedCover, setGeneratedCover] = useState<string | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);

  useEffect(() => {
    if (coverUrl || !hasPdf) return;
    let active = true;
    setGenerationFailed(false);
    generatePdfCover(source)
      .then((image) => { if (active) setGeneratedCover(image); })
      .catch(() => { if (active) setGenerationFailed(true); });
    return () => { active = false; };
  }, [coverUrl, hasPdf, source]);

  if (coverUrl) {
    return <img src={coverUrl} alt={`${title} cover`} loading={eager ? "eager" : "lazy"} className={`h-full w-full object-cover ${className}`} />;
  }

  if (hasPdf && generatedCover) {
    return <img src={generatedCover} alt={`${title} cover, generated from the first PDF page`} className={`h-full w-full object-cover object-top ${className}`} />;
  }

  if (hasPdf && !generationFailed) {
    return <div className={`grid h-full w-full place-items-center bg-[#F3F6FB] ${className}`} role="status" aria-label={`Generating the cover for ${title}`}><div className="text-center"><span className="mx-auto block size-7 animate-pulse rounded-[8px] bg-brand-blue/15" /><span className="mt-3 block text-[10px] font-medium text-brand-body/50">Preparing cover…</span></div></div>;
  }

  return <div className={`grid h-full w-full place-items-center bg-[#EEF3FB] ${className}`}><FileText className="size-10 text-brand-navy/20" aria-hidden="true" /></div>;
}
