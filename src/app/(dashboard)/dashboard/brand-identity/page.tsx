"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  CalendarDays,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Palette,
} from "lucide-react";
import type { BrandIdentityDelivery, BrandIdentityFile } from "@/lib/brand-identity";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(file: BrandIdentityFile) {
  if (file.file_kind === "image") return ImageIcon;
  if (file.file_kind === "archive") return Archive;
  return FileText;
}

export default function ClientBrandIdentityPage() {
  const [identities, setIdentities] = useState<BrandIdentityDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/client/brand-identities", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Could not load Brand Identity deliveries.");
        setIdentities(payload.identities || []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load Brand Identity deliveries."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1400px] p-5 sm:p-6 lg:p-8" data-client-brand-identity-page>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[4px] bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">
            <Palette className="h-3.5 w-3.5" /> Completed work
          </div>
          <h1 className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-brand-navy sm:text-[34px]">Brand Identity</h1>
          <p className="mt-1 max-w-[680px] text-[13px] leading-6 text-[#69738D]">
            Your completed identity systems, guidelines, logo packs and final source files delivered by CDS Space.
          </p>
        </div>
        <div className="rounded-[8px] border border-[#E1E7F2] bg-white px-4 py-3 text-[11px] text-[#69738D] shadow-[0_8px_24px_rgba(15,40,90,0.04)]">
          <span className="font-bold text-brand-navy">{identities.length}</span> published {identities.length === 1 ? "identity" : "identities"}
        </div>
      </div>

      {error && <div className="mt-6 rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{error}</div>}

      {loading ? (
        <div className="grid min-h-[360px] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-blue" /></div>
      ) : identities.length === 0 ? (
        <div className="mt-7 grid min-h-[360px] place-items-center rounded-[16px] border border-white/70 bg-white/80 px-6 text-center shadow-[0_10px_40px_rgba(15,40,90,0.05)]">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-[12px] bg-violet-50 text-violet-600"><FolderOpen className="h-7 w-7" /></div>
            <h2 className="mt-4 text-[17px] font-bold text-brand-navy">No completed identity delivered yet</h2>
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-[#7B859B]">When CDS Space completes and publishes your brand work, the full handover will appear here with a public link you can share.</p>
          </div>
        </div>
      ) : (
        <div className="mt-7 space-y-5">
          {identities.map((identity) => (
            <article key={identity.id} className="overflow-hidden rounded-[16px] border border-[#E1E7F2] bg-white shadow-[0_16px_48px_rgba(15,40,90,0.055)]">
              <div className="flex flex-col gap-4 border-b border-[#EDF1F7] bg-[#0A4FE8] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">{identity.client_name || "Client Brand Identity"}</p>
                  <h2 className="mt-1 text-[22px] font-bold tracking-[-0.02em]">{identity.title}</h2>
                  {identity.description && <p className="mt-2 max-w-2xl text-[12px] leading-5 text-white/75">{identity.description}</p>}
                  {identity.published_at && <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-white/60"><CalendarDays className="h-3.5 w-3.5" /> Delivered {new Date(identity.published_at).toLocaleDateString()}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {identity.public_url && <UniversalShareButton title={identity.title} text={`View ${identity.title}, a completed Brand Identity from CDS Space.`} url={identity.public_url} className="h-10 rounded-[8px] border-white/20 bg-white/12 px-4 text-[12px] text-white ring-1 ring-white/20 hover:bg-white/20" />}
                  {identity.public_url && <a href={identity.public_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-white px-4 text-[12px] font-bold text-[#0A4FE8] transition hover:bg-blue-50"><ExternalLink className="h-4 w-4" /> Public view</a>}
                </div>
              </div>

              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
                {identity.files.map((file) => {
                  const Icon = fileIcon(file);
                  return (
                    <div key={file.id} className="flex items-center gap-3 rounded-[12px] border border-[#E7ECF4] bg-[#FAFBFD] p-4">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-white text-brand-blue shadow-sm"><Icon className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-bold text-brand-navy" title={file.file_name}>{file.file_name}</p>
                        <p className="mt-0.5 text-[10px] text-[#939DB2]">{formatBytes(file.file_size)}</p>
                      </div>
                      {file.download_url && <a href={file.download_url} target="_blank" rel="noreferrer" download className="grid h-8 w-8 place-items-center rounded-[8px] text-[#8893AA] transition hover:bg-blue-50 hover:text-brand-blue" aria-label={`Download ${file.file_name}`}><Download className="h-4 w-4" /></a>}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
