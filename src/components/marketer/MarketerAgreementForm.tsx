"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, FileSignature, Loader2, ShieldCheck } from "lucide-react";

export function MarketerAgreementForm(props: {
  publicId: string;
  email: string;
  fullName: string;
  signingTime: string;
  termsVersion: number;
  privacyVersion: number;
  agreementVersion: number;
}) {
  const [name, setName] = useState(props.fullName);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function sign() {
    if (!accepted || name.trim().length < 2) { setError("Enter your full legal name and accept all three documents."); return; }
    setSaving(true); setError("");
    const response = await fetch("/api/marketer/agreement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accepted: true, signerName: name.trim() }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error || "Could not record the agreement."); setSaving(false); return; }
    window.location.replace(result.next || "/marketer/onboarding");
  }

  return (
    <OnboardingFrame step="01 / 03" eyebrow="One-time agreement" title="Review and sign before you continue" subtitle="Your acceptance of all three documents is stored with your marketer ID, date and signing time.">
      <section className="rounded-[16px] border border-[#DDE5F4] bg-white p-5 shadow-[0_12px_32px_rgba(4,11,55,.06)] sm:p-6">
        <div className="mb-5 flex items-center gap-2"><ShieldCheck className="size-5 text-[#075BE5]" /><h2 className="text-[15px] font-semibold">Marketer account being authorised</h2></div>
        <dl className="grid gap-4 text-[13px] sm:grid-cols-2"><Detail label="Email" value={props.email} /><Detail label="Marketer ID" value={props.publicId} mono /><Detail label="Signing time" value={new Date(props.signingTime).toLocaleString()} /><Detail label="Agreement set" value="Terms · Privacy · Marketer" /></dl>
      </section>
      <section className="rounded-[16px] border border-[#DDE5F4] bg-[#F3F6FD] p-[5px]"><div className="rounded-[12px] bg-white p-5 sm:p-6">
        <label className="mb-2 block text-[13px] font-semibold text-[#344054]">Full legal name</label><input value={name} onChange={(e) => setName(e.target.value)} className="h-12 w-full rounded-[12px] border border-[#DDE5F4] px-4 text-[15px] outline-none focus:border-[#075BE5] focus:ring-4 focus:ring-blue-100" />
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[12px] border border-[#DDE5F4] bg-[#F8FAFE] p-4"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 size-4 accent-[#075BE5]" /><span className="text-[13px] leading-6 text-[#475467]">I have read and agree to the CDS Space <Link href="/terms" target="_blank" className="font-semibold text-[#075BE5] underline">Terms of Service</Link>, <Link href="/privacy" target="_blank" className="font-semibold text-[#075BE5] underline">Privacy Policy</Link> and <Link href="/legal/brand-marketer-agreement" target="_blank" className="font-semibold text-[#075BE5] underline">Brand Marketer Agreement</Link>.</span></label>
        <p className="mt-3 text-[11px] text-[#98A2B3]">Terms v{props.termsVersion} · Privacy v{props.privacyVersion} · Marketer Agreement v{props.agreementVersion}</p>
      </div></section>
      {error && <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-600">{error}</p>}
      <button onClick={sign} disabled={!accepted || saving} className="flex h-14 w-full items-center justify-center gap-2 rounded-[16px] bg-[#0A4FE8] text-[14px] font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="size-5 animate-spin" /> : <FileSignature className="size-5" />}{saving ? "Recording agreement..." : "Sign all three and continue"}</button>
    </OnboardingFrame>
  );
}

export function OnboardingFrame({ children, eyebrow, title, subtitle, step }: { children: React.ReactNode; eyebrow: string; title: string; subtitle: string; step: string }) {
  return <main className="min-h-screen bg-[#F3F6FD] px-4 py-8 sm:px-6"><div className="mx-auto max-w-[720px]"><div className="mb-8 flex items-center justify-between"><Link href="/" className="font-bold text-[#040B37]">CDS Space <span className="text-[#075BE5]">Marketers</span></Link><span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold tracking-[.12em] text-[#667085]">{step}</span></div><header className="mb-7"><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#075BE5]">{eyebrow}</p><h1 className="mt-2 text-[30px] font-bold tracking-[-.03em] text-[#040B37] sm:text-[38px]">{title}</h1><p className="mt-3 max-w-[620px] text-[14px] leading-6 text-[#667085]">{subtitle}</p></header><div className="space-y-5">{children}</div></div></main>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt className="mb-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#98A2B3]">{label}</dt><dd className={mono ? "font-mono text-[12px] font-semibold" : "font-medium"}>{value}</dd></div>; }
