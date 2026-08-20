"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, FileSignature, Loader2, ShieldCheck } from "lucide-react";

interface AgreementFormProps {
  next: string;
  userId: string;
  email: string;
  fullName: string;
  companyName: string;
  agreementText: string;
  termsVersion: number;
  privacyVersion: number;
  signingTime: string;
  authorizationToken: string;
}

export function AgreementForm({
  next,
  userId,
  email,
  fullName,
  companyName,
  agreementText,
  termsVersion,
  privacyVersion,
  signingTime,
  authorizationToken,
}: AgreementFormProps) {
  const [signerName, setSignerName] = useState(fullName);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sign = async () => {
    if (!accepted) {
      setError("Please confirm that you agree before continuing.");
      return;
    }
    if (signerName.trim().length < 2) {
      setError("Enter your full name to sign the agreement.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/client/legal-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accepted: true,
          signerName: signerName.trim(),
          next,
          authorizationToken,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not record your agreement.");
      window.location.replace(result.next || next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record your agreement.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[630px] flex-col gap-6 2xl:gap-8">
      <header>
        <div className="mb-4 grid size-12 place-items-center rounded-[12px] bg-blue-50 text-brand-blue">
          <FileSignature className="size-6" aria-hidden="true" />
        </div>
        <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-brand-blue">One-time agreement</p>
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-brand-navy 2xl:text-[36px]">Before you enter your dashboard</h1>
        <p className="mt-2 max-w-[580px] text-[14px] font-medium leading-relaxed text-brand-body 2xl:text-[15px]">
          Review the account details below and sign once. Your acceptance is stored with your account ID and signing time.
        </p>
      </header>

      <section className="rounded-[16px] border border-brand-stroke bg-white p-5 shadow-[0_12px_32px_rgba(4,11,55,0.06)] sm:p-6">
        <div className="mb-5 flex items-center gap-2 text-brand-navy">
          <ShieldCheck className="size-5 text-brand-blue" aria-hidden="true" />
          <h2 className="text-[15px] font-semibold">Account being authorised</h2>
        </div>
        <dl className="grid gap-4 text-[13px] sm:grid-cols-2">
          <Detail label="Email" value={email} />
          <Detail label="Company" value={companyName || "Not provided"} />
          <Detail label="User ID" value={userId} mono />
          <Detail label="Signing time" value={new Date(signingTime).toLocaleString()} />
        </dl>
      </section>

      <section className="rounded-[16px] border border-brand-stroke bg-brand-bg p-[5px]">
        <div className="rounded-[12px] bg-white p-5 sm:p-6">
          <label htmlFor="signature-name" className="mb-2 block text-[13px] font-semibold text-brand-body">Full legal name</label>
          <input
            id="signature-name"
            value={signerName}
            onChange={(event) => setSignerName(event.target.value)}
            autoComplete="name"
            className="h-12 w-full rounded-[12px] border border-brand-stroke bg-white px-4 text-[16px] text-brand-navy outline-none transition focus:border-brand-blue/40 focus:ring-4 focus:ring-blue-100/80"
            placeholder="Enter your full name"
          />

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[12px] border border-brand-stroke bg-brand-bg/50 p-4">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="peer sr-only"
            />
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[4px] border border-brand-stroke-ii bg-white text-transparent peer-checked:border-brand-blue peer-checked:bg-brand-blue peer-checked:text-white">
              <Check className="size-3.5" aria-hidden="true" />
            </span>
            <span className="text-[13px] font-medium leading-relaxed text-brand-body">
              {agreementText} Read the{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-brand-blue hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/privacy" target="_blank" className="font-semibold text-brand-blue hover:underline">Privacy Policy</Link>.
            </span>
          </label>

          <p className="mt-3 text-[11px] font-medium text-brand-mute">
            Terms version {termsVersion} and Privacy version {privacyVersion}. This acceptance is recorded once for this user ID.
          </p>
        </div>
      </section>

      {error && <p role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-600">{error}</p>}

      <button
        type="button"
        onClick={sign}
        disabled={saving || !accepted}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-[16px] bg-[#0A4FE8] text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(5,90,230,0.22)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
        {saving ? "Recording agreement..." : "Agree and enter dashboard"}
      </button>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-mute">{label}</dt>
      <dd className={`truncate font-medium text-brand-navy ${mono ? "font-mono text-[11px]" : ""}`} title={value}>{value}</dd>
    </div>
  );
}
