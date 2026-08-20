"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { FileType2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudioPreview } from "../shared/StudioPreview";
import type { AssetFile } from "../../shared/AssetHub";
import type { BannerFormData } from "./types";
import type { BannerProduct } from "@/lib/banner-commerce";

interface PreviewProps {
  formData: BannerFormData;
  product?: BannerProduct | null;
}

function PlainArtwork({ file }: { file: AssetFile | null }) {
  const [source, setSource] = useState<string | null>(file?.preview || null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setSource(file?.preview || null);
    setPreviewFailed(false);
  }, [file?.preview, file?.storagePath]);

  if (source && file?.previewKind === "image" && !previewFailed) {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-[16px] bg-white">
        <img
          src={source}
          alt={`Preview of ${file.name}`}
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => {
            const authenticatedSource = file.storagePath
              ? `/api/banners/file?path=${encodeURIComponent(file.storagePath)}`
              : null;
            if (authenticatedSource && source !== authenticatedSource) {
              setSource(authenticatedSource);
            } else {
              setPreviewFailed(true);
            }
          }}
        />
      </div>
    );
  }
  if (source && file?.previewKind === "pdf") {
    return <object data={`${source}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`} type="application/pdf" aria-label={`PDF preview of ${file.name}`} className="h-full w-full rounded-[16px] bg-white"><div className="grid h-full place-items-center text-[11px] text-slate-500">PDF artwork uploaded</div></object>;
  }
  if (file) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[16px] bg-white p-5 text-center"><FileType2 className="h-8 w-8 text-[#0A4FE8]" /><p className="max-w-full break-words text-[11px] font-bold text-[#0D1B39]">{file.name}</p><p className="text-[9px] text-slate-500">The production source file is uploaded and ready.</p></div>;
  }
  return <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[16px] bg-white p-5 text-center"><ImageIcon className="h-8 w-8 text-slate-300" /><p className="text-[11px] font-bold text-[#0D1B39]">Upload artwork to preview it here</p></div>;
}

function ProductPresentation({ product, custom }: { product?: BannerProduct | null; custom: boolean }) {
  if (product?.presentation_image_url) {
    return <div className="relative h-full w-full overflow-hidden rounded-[16px] bg-white"><Image src={product.presentation_image_url} alt={`${product.name} product presentation`} fill unoptimized className="object-contain" /></div>;
  }
  return <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[16px] bg-white p-6 text-center"><ImageIcon className="h-9 w-9 text-blue-300" /><p className="text-[12px] font-bold text-[#0D1B39]">{custom ? "Custom banner presentation" : product?.name || "Product presentation"}</p><p className="max-w-[220px] text-[10px] leading-4 text-slate-500">{custom ? "Your exact dimensions and finishing will be reviewed before quotation." : "The product presentation will appear here when it is added in Sales Hub."}</p></div>;
}

export function BannerLabPreview({ formData, product }: PreviewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const readyFiles = formData.executionMode === "Upload" ? formData.readyFiles as AssetFile[] : [];
  const maxIndex = Math.max(0, readyFiles.length - 1);
  useEffect(() => setActiveIndex((current) => Math.min(current, maxIndex)), [maxIndex]);

  const activeFile = readyFiles[activeIndex] || null;
  const showArtwork = formData.executionMode === "Upload" && Boolean(activeFile);
  const hasSelectedBanner = Boolean(formData.productId || formData.isCustom);
  const sizeLabel = formData.isCustom
    ? `${formData.customWidth || "Not set"} × ${formData.customHeight || "Not set"} ${formData.dimensionUnit}`
    : formData.size ? `${formData.size} cm` : "Banner size pending";

  return (
    <StudioPreview isEmpty={!hasSelectedBanner} subtitle={showArtwork ? "Your printable artwork" : "Product presentation"} previewClassName="!aspect-auto min-h-[calc(100vh-220px)] flex-1 !p-3 2xl:!p-4">
      <div className="flex h-full w-full flex-col gap-3">
        <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50 p-2 shadow-inner">
          {showArtwork ? <PlainArtwork file={activeFile} /> : <ProductPresentation product={product} custom={formData.isCustom} />}
        </div>
        <div className="rounded-full bg-white px-3 py-1 text-center text-[10px] font-semibold text-slate-500 shadow-sm">{sizeLabel} · {formData.quality}</div>
        {showArtwork && readyFiles.length > 1 && <div className="flex max-w-full items-center justify-center gap-1.5 overflow-x-auto pb-1" aria-label="Choose artwork preview">{readyFiles.map((file, index) => <button key={`${file.name}-${index}`} type="button" onClick={() => setActiveIndex(index)} className={cn("grid h-7 min-w-7 place-items-center rounded-lg border px-2 text-[9px] font-bold transition", activeIndex === index ? "border-[#0A4FE8] bg-[#0A4FE8] text-white" : "border-slate-200 bg-white text-slate-500 hover:border-blue-300")} aria-label={`Preview design ${index + 1}`}>{index + 1}</button>)}</div>}
      </div>
    </StudioPreview>
  );
}
