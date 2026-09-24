"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  FileStack,
  FileText,
  Files,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { LetterheadStudio } from "@/components/create/LetterheadStudio";
import { appConfirm } from "@/lib/app-notify";

type LetterheadPage = "first" | "second";

type CompanyState = {
  firstPageName: string | null;
  secondPageName: string | null;
  hasFirstPage: boolean;
  hasSecondPage: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

const ACCEPT = ".jpg,.jpeg,.png,.pdf,.svg,image/jpeg,image/png,image/svg+xml,application/pdf";

/** Official CDS Space correspondence and its two-page stationery system. */
export function CompanyLetterheadStudio() {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstInput = useRef<HTMLInputElement | null>(null);
  const secondInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/executive-board/letterhead", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The company letterhead could not be loaded.");
      setCompany(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The company letterhead could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function upload(page: LetterheadPage, file: File) {
    setBusy(`upload-${page}`);
    setError(null);
    setNotice(null);
    const body = new FormData();
    body.append("file", file);
    body.append("page", page);
    const response = await fetch("/api/admin/executive-board/letterhead", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(payload.error || "The company letterhead could not be saved.");
      return;
    }
    setNotice(page === "first"
      ? "First-page letterhead saved. New documents will use it on page one."
      : "Continuation letterhead saved. New documents will use it from page two onward.");
    await load();
  }

  async function remove(page: LetterheadPage) {
    const label = page === "first" ? "first-page" : "continuation-page";
    if (!(await appConfirm(`Remove the ${label} letterhead design? Existing documents will not be changed.`))) return;
    setBusy(`remove-${page}`);
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/admin/executive-board/letterhead?page=${page}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(payload.error || "The letterhead design could not be removed.");
      return;
    }
    setNotice(page === "first" ? "First-page design removed." : "Continuation-page design removed.");
    await load();
  }

  const complete = Boolean(company?.hasFirstPage && company?.hasSecondPage);
  const version = company?.updatedAt ? encodeURIComponent(company.updatedAt) : "current";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/executive-board" className="text-xs font-semibold text-[#0A4FE8] hover:underline">
            Executive Board
          </Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[#07133B] sm:text-[28px]">Letterhead documents</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Manage official CDS Space stationery and create board-approved correspondence in one secure workspace.
          </p>
        </div>
        <Link
          href="/admin/executive-board"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-[#0A4FE8] hover:text-[#0A4FE8]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to board
        </Link>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EDF3FF] text-[#0A4FE8]">
              <FileStack className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-[#07133B]">Company stationery</h2>
                {!loading && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {complete ? "Both templates ready" : "Setup incomplete"}
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                Page one uses the first-page artwork. Every additional page uses the continuation artwork. Each new document keeps a private copy, so replacing a template never changes an existing letter.
              </p>
            </div>
          </div>
          {company?.updatedAt && (
            <p className="text-right text-[11px] leading-5 text-slate-400">
              Last updated {new Date(company.updatedAt).toLocaleDateString()}
              {company.updatedBy ? <><br />by {company.updatedBy}</> : null}
            </p>
          )}
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
          <PageTemplateCard
            icon={FileText}
            eyebrow="Page 1"
            title="First-page letterhead"
            description="Used on the opening page of every new official letter."
            name={company?.firstPageName || null}
            available={Boolean(company?.hasFirstPage)}
            previewUrl={company?.hasFirstPage ? `/api/admin/executive-board/letterhead/asset/first?v=${version}` : null}
            busy={busy === "upload-first" || busy === "remove-first"}
            onUpload={() => firstInput.current?.click()}
            onRemove={() => void remove("first")}
          />
          <PageTemplateCard
            icon={Files}
            eyebrow="Page 2 and later"
            title="Continuation letterhead"
            description="Used automatically on every page after the opening page."
            name={company?.secondPageName || null}
            available={Boolean(company?.hasSecondPage)}
            previewUrl={company?.hasSecondPage ? `/api/admin/executive-board/letterhead/asset/second?v=${version}` : null}
            busy={busy === "upload-second" || busy === "remove-second"}
            onUpload={() => secondInput.current?.click()}
            onRemove={() => void remove("second")}
          />
          <input ref={firstInput} type="file" accept={ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void upload("first", file); }} />
          <input ref={secondInput} type="file" accept={ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void upload("second", file); }} />
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[11.5px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Private, access-controlled, and malware-scanned before storage.</span>
          <span>JPG, PNG, PDF or SVG · Maximum 5MB per page</span>
        </div>
      </section>

      {(notice || error) && (
        <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error ? <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{error || notice}</span>
        </div>
      )}

      <div className="my-6 h-px bg-slate-200" />

      <LetterheadStudio
        workspaceKind="admin"
        scope="executive_board"
        lockedLetterhead
        onBack={() => router.push("/admin/executive-board")}
      />
    </div>
  );
}

function PageTemplateCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  name,
  available,
  previewUrl,
  busy,
  onUpload,
  onRemove,
}: {
  icon: typeof FileText;
  eyebrow: string;
  title: string;
  description: string;
  name: string | null;
  available: boolean;
  previewUrl: string | null;
  busy: boolean;
  onUpload: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[132px_minmax(0,1fr)]">
      <div className="relative aspect-[210/297] overflow-hidden rounded-xl border border-slate-200 bg-[#F3F6FB] shadow-sm">
        {previewUrl ? (
          <img src={previewUrl} alt={`${title} preview`} className="absolute inset-0 h-full w-full object-fill" />
        ) : (
          <div className="grid h-full place-items-center px-3 text-center">
            <span>
              <Icon className="mx-auto h-7 w-7 text-slate-300" />
              <span className="mt-2 block text-[10px] font-medium text-slate-400">No artwork uploaded</span>
            </span>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-white/95 px-2 py-1 text-[9px] font-semibold text-slate-600 shadow-sm">{eyebrow}</span>
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EDF3FF] text-[#0A4FE8]"><Icon className="h-4 w-4" /></span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {available ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{available ? "Active" : "Not uploaded"}
          </span>
        </div>
        <h3 className="mt-3 text-sm font-bold text-[#07133B]">{title}</h3>
        <p className="mt-1 text-[11.5px] leading-5 text-slate-500">{description}</p>
        {name && <p className="mt-2 truncate text-[11px] font-medium text-slate-600" title={name}>{name}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <button type="button" onClick={onUpload} disabled={busy} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-3 text-[11.5px] font-semibold text-white transition hover:bg-[#083FC0] disabled:opacity-60">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {available ? "Replace design" : "Upload design"}
          </button>
          {available && (
            <button type="button" onClick={onRemove} disabled={busy} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60" aria-label={`Remove ${title.toLowerCase()}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
