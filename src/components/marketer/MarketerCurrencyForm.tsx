"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { CLIENT_BILLING_CURRENCY_OPTIONS, type ClientBillingCurrency } from "@/lib/client-billing";
import { OnboardingFrame } from "./MarketerAgreementForm";

export function MarketerCurrencyForm({ initialCurrency }: { initialCurrency: ClientBillingCurrency | null }) {
  const router = useRouter();
  const [currency, setCurrency] = useState<ClientBillingCurrency | null>(initialCurrency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!currency) return;
    setSaving(true); setError("");
    const response = await fetch("/api/marketer/currency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error || "Could not save currency."); setSaving(false); return; }
    router.replace(result.next || "/marketer/profile?setup=1");
  }
  return <OnboardingFrame step="02 / 03" eyebrow="Payout setup" title="Choose your earnings currency" subtitle="This becomes the default currency for your payout account. Source commissions remain traceable in the currency of each paid client invoice.">
    <section className="rounded-[16px] border border-[#DDE5F4] bg-white p-5 sm:p-6"><div className="grid gap-3 sm:grid-cols-2">{CLIENT_BILLING_CURRENCY_OPTIONS.map((item) => { const active = currency === item.code; return <button key={item.code} onClick={() => setCurrency(item.code)} className={`flex min-h-[100px] items-center gap-4 rounded-[12px] border p-4 text-left transition ${active ? "border-[#075BE5] bg-blue-50 ring-4 ring-blue-100" : "border-[#DDE5F4] hover:border-blue-300"}`}><span className={`grid size-11 shrink-0 place-items-center rounded-[8px] font-bold ${active ? "bg-[#075BE5] text-white" : "bg-[#F3F6FD]"}`}>{item.symbol}</span><span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{item.name} <span className="text-[10px] text-[#98A2B3]">{item.code}</span></span><span className="mt-1 block text-[11px] leading-4 text-[#667085]">{item.description}</span></span>{active && <Check className="size-5 shrink-0 text-[#075BE5]" />}</button>; })}</div><p className="mt-5 text-[11px] text-[#98A2B3]">CDS Space is accessible from every country, let&apos;s partner together.</p></section>
    {error && <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</p>}
    <button onClick={save} disabled={!currency || saving} className="flex h-14 w-full items-center justify-center gap-2 rounded-[16px] bg-[#0A4FE8] text-[14px] font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}{saving ? "Saving..." : "Save currency and continue"}</button>
  </OnboardingFrame>;
}
