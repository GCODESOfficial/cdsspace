"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Palette,
  ShieldCheck,
} from "lucide-react";
import type { BrandIdentityFile } from "@/lib/brand-identity";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";

interface PublicIdentity {
  title: string;
  description: string | null;
  project_name: string | null;
  client_name: string | null;
  public_token: string;
  published_at: string | null;
  files: BrandIdentityFile[];
}

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

export default function BrandIdentityPublicClient({ token }: { token: string }) {
  const [identity, setIdentity] = useState<PublicIdentity | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/brand-identity/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Not found");
        setIdentity(payload.identity);
      })
      .catch(() => setNotFound(true));
  }, [token]);

  if (notFound) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F2F6FF] px-5">
        <div className="max-w-md rounded-[16px] border border-white bg-white p-8 text-center shadow-[0_20px_70px_rgba(15,40,90,0.08)]">
          <Palette className="mx-auto h-10 w-10 text-[#AAB5CA]" />
          <h1 className="mt-4 text-[22px] font-bold text-[#071139]">Brand Identity not found</h1>
          <p className="mt-2 text-[13px] leading-5 text-[#778197]">This link is invalid, unpublished, or has been disabled by CDS Space.</p>
        </div>
      </main>
    );
  }

  if (!identity) {
    return <main className="grid min-h-screen place-items-center bg-[#F2F6FF]"><Loader2 className="h-7 w-7 animate-spin text-[#0A4FE8]" /></main>;
  }

  const imageFiles = identity.files.filter((file) => file.file_kind === "image" && file.download_url);

  return (
    <main className="min-h-screen bg-[#F2F6FF] text-[#071139]" data-public-brand-identity>
      <header className="border-b border-white/10 bg-[#061343] px-5 py-5 text-white sm:px-8">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-[8px] border border-white/15 bg-white/10">
              <Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={28} height={28} className="brightness-0 invert" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">CDS Space</p>
              <p className="text-[13px] font-semibold text-white/90">Brand Identity handover</p>
            </div>
          </div>
          <UniversalShareButton title={identity.title} text={`View ${identity.title}, a completed Brand Identity from CDS Space.`} url={`/brand-identity/${token}`} className="h-10 rounded-[8px] border-white bg-white px-4 text-[12px]" />
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#0A4FE8] px-5 pb-28 pt-16 text-white sm:px-8 sm:pb-32 sm:pt-20">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-300/15 blur-3xl" />
        <div className="relative mx-auto max-w-[980px] text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80"><CheckCircle2 className="h-3.5 w-3.5" /> Verified CDS Space delivery</div>
          <h1 className="mx-auto mt-5 max-w-4xl text-[36px] font-bold leading-[1.05] tracking-[-0.04em] sm:text-[52px]">{identity.title}</h1>
          {identity.description && <p className="mx-auto mt-4 max-w-2xl text-[14px] leading-6 text-white/75 sm:text-[15px]">{identity.description}</p>}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-white/60">
            {identity.client_name && <span>{identity.client_name}</span>}
            {identity.published_at && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Delivered {new Date(identity.published_at).toLocaleDateString()}</span>}
            <span>{identity.files.length} files</span>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-16 max-w-[1180px] px-5 pb-16 sm:px-8">
        {imageFiles.length > 0 && (
          <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {imageFiles.slice(0, 6).map((file) => (
              <a key={file.id} href={file.download_url || "#"} target="_blank" rel="noreferrer" className="group relative aspect-[4/3] overflow-hidden rounded-[16px] border border-white bg-white shadow-[0_16px_50px_rgba(5,25,80,0.12)]">
                {/* Signed delivery images can come from a private storage host, so use a native image rather than requiring every host in next/image config. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.download_url || ""} alt={file.file_name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#061343]/90 to-transparent px-4 pb-4 pt-10 text-[11px] font-semibold text-white">{file.file_name}</div>
              </a>
            ))}
          </section>
        )}

        <section className="rounded-[16px] border border-white bg-white p-5 shadow-[0_20px_70px_rgba(15,40,90,0.08)] sm:p-7">
          <div className="flex flex-col gap-3 border-b border-[#EDF1F7] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[20px] font-bold tracking-[-0.02em]">Brand files</h2>
              <p className="mt-1 text-[12px] text-[#7B859B]">Download the approved files included in this public handover.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-[8px] bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Secure share link</div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {identity.files.map((file) => {
              const Icon = fileIcon(file);
              return (
                <div key={file.id} className="flex items-center gap-3 rounded-[12px] border border-[#E5EAF3] bg-[#FAFBFD] p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-white text-[#0A4FE8] shadow-sm"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold" title={file.file_name}>{file.file_name}</p>
                    <p className="mt-0.5 text-[10px] text-[#929CB0]">{formatBytes(file.file_size)}</p>
                  </div>
                  {file.download_url && <a href={file.download_url} target="_blank" rel="noreferrer" download className="grid h-8 w-8 place-items-center rounded-[8px] text-[#8994AA] transition hover:bg-blue-50 hover:text-[#0A4FE8]" aria-label={`Download ${file.file_name}`}><Download className="h-4 w-4" /></a>}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-[12px] bg-[#F2F6FF] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Palette className="mt-0.5 h-5 w-5 shrink-0 text-[#0A4FE8]" />
              <div>
                <p className="text-[12px] font-bold">Created and delivered by CDS Space</p>
                <p className="mt-0.5 text-[10px] leading-4 text-[#7B859B]">This page can be viewed without a CDS Space account. Access can be disabled by the account owner or CDS Space.</p>
              </div>
            </div>
            <UniversalShareButton title={identity.title} text={`View ${identity.title}, a completed Brand Identity from CDS Space.`} url={`/brand-identity/${token}`} label="Share link" className="h-9 min-h-9 shrink-0 rounded-[8px] border-blue-200 px-3 text-[11px]" />
          </div>
        </section>
      </div>
    </main>
  );
}
