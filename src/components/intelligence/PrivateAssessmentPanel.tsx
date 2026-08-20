"use client";

import { useState } from "react";
import { Calendar, Check, Loader2, ShieldCheck } from "lucide-react";
import { appToast } from "@/lib/app-notify";

export default function PrivateAssessmentPanel({ slug, status, expiresAt }: { slug: string; status: string; expiresAt?: string | null }) {
  const [acknowledged, setAcknowledged] = useState(status === "acknowledged" || status === "consultation_requested");
  const [busy, setBusy] = useState(false);
  async function act(action: "acknowledge" | "consultation") {
    setBusy(true);
    try {
      const response = await fetch(`/api/intelligence/${encodeURIComponent(slug)}/private`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const json = await response.json();
      if (!response.ok) return appToast(json.error || "Could not update this assessment.");
      if (action === "acknowledge") { setAcknowledged(true); appToast("Assessment acknowledged"); }
      else appToast("Consultation request sent to CDS Space");
    } finally { setBusy(false); }
  }
  return <aside className="mb-9 rounded-[16px] border border-[#C7D6F7] bg-[#F0F5FF] p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white text-brand-blue"><ShieldCheck className="size-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.13em] text-brand-blue">Private client assessment</p><p className="mt-2 max-w-[560px] text-[12px] leading-5 text-brand-body">This confidential report is assigned to your account. Acknowledgement and consultation requests are recorded in the report history.</p>{expiresAt && <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-brand-body/60"><Calendar className="size-3" />Access expires {new Date(expiresAt).toLocaleString()}</p>}</div></div><div className="flex shrink-0 flex-wrap gap-2"><button disabled={busy || acknowledged} onClick={() => act("acknowledge")} className="inline-flex items-center gap-2 rounded-[8px] border border-brand-blue bg-white px-3 py-2.5 text-[11px] font-semibold text-brand-blue disabled:opacity-60">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{acknowledged ? "Acknowledged" : "Acknowledge report"}</button><button disabled={busy} onClick={() => act("consultation")} className="rounded-[8px] bg-brand-blue px-3 py-2.5 text-[11px] font-semibold text-white">Request consultation</button></div></div></aside>;
}
