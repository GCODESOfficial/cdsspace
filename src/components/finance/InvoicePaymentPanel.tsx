"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Check, Clock3, CreditCard, Download, FileUp, Loader2, ShieldCheck, X } from "lucide-react";
import { formatMoney, type FinanceBankAccount, type FinanceInvoice, type FinanceReceipt, type InvoicePaymentSubmission } from "@/lib/finance/types";

export default function InvoicePaymentPanel({
  token,
  invoice,
  submission,
  receipt,
  bankAccounts,
  paystackAvailable,
  onSubmitted,
}: {
  token: string;
  invoice: FinanceInvoice;
  submission: InvoicePaymentSubmission | null;
  receipt: FinanceReceipt | null;
  bankAccounts: FinanceBankAccount[];
  paystackAvailable: boolean;
  onSubmitted: (submission: InvoicePaymentSubmission) => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"choice" | "transfer">("choice");
  const [reference, setReference] = useState(submission?.transfer_reference || "");
  const outstanding = Math.max(Number(invoice.total || 0) - Number(invoice.amount_paid || 0), 0);
  const [amount, setAmount] = useState(String(outstanding));
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startingPaystack, setStartingPaystack] = useState(false);
  const [error, setError] = useState("");

  if (invoice.status === "paid" && receipt) {
    return (
      <section id="payment" className="no-print mx-auto mb-6 max-w-[820px] rounded-[18px] border border-emerald-100 bg-emerald-50/80 p-5 shadow-[0_12px_34px_rgba(15,90,70,0.08)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check className="h-5 w-5" strokeWidth={3} /></div>
            <div><h2 className="text-sm font-black text-emerald-950">Payment confirmed</h2><p className="mt-1 text-xs leading-5 text-emerald-800">Your receipt has been issued and can be downloaded for your records.</p></div>
          </div>
          <Link href={`/receipt/${receipt.public_token}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-bold text-white shadow-lg shadow-emerald-700/15"><Download className="h-4 w-4" />View receipt</Link>
        </div>
      </section>
    );
  }

  if (submission?.status === "pending") {
    return (
      <section id="payment" className="no-print mx-auto mb-6 max-w-[820px] rounded-[18px] border border-amber-200 bg-amber-50 p-5 shadow-[0_12px_34px_rgba(120,80,10,0.07)]">
        <div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><Clock3 className="h-5 w-5" /></div><div><h2 className="text-sm font-semibold text-amber-950">Thank you, your transfer is safely recorded</h2><p className="mt-1 text-xs leading-5 text-amber-800">You can relax while our finance team confirms it during business hours. We will notify you as soon as it is approved, and your project will move forward with the care and quality you expect from CDS Space.</p>{submission.proof_file_name && <p className="mt-2 text-[11px] font-semibold text-amber-900">Proof received: {submission.proof_file_name}</p>}</div></div>
      </section>
    );
  }

  if (invoice.status === "cancelled" || invoice.status === "draft") return null;

  const submitTransfer = async () => {
    const transferredAmount = Number(amount);
    if (!Number.isFinite(transferredAmount) || transferredAmount <= 0 || transferredAmount > outstanding + 0.01) {
      setError(`Enter an amount between 0.01 and ${formatMoney(outstanding, invoice.currency)}.`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.set("reference", reference);
      form.set("amount", amount);
      form.set("payerName", invoice.client_name || "");
      form.set("payerEmail", invoice.client_email || "");
      if (proof) form.set("proof", proof);
      const response = await fetch(`/api/finance/invoice/${token}/payment`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The transfer could not be submitted.");
      onSubmitted(data.submission);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The transfer could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const startPaystack = async () => {
    setStartingPaystack(true);
    setError("");
    try {
      const response = await fetch(`/api/finance/invoice/${token}/paystack`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authorization_url) throw new Error(data.error || "Paystack checkout could not be started.");
      window.location.assign(data.authorization_url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Paystack checkout could not be started.");
      setStartingPaystack(false);
    }
  };

  const hasBankTransfer = bankAccounts.length > 0;

  return (
    <>
      <section id="payment" className="no-print mx-auto mb-6 max-w-[820px] overflow-hidden rounded-[18px] border border-blue-100 bg-[#06103A] p-5 text-white shadow-[0_18px_48px_rgba(6,16,58,0.18)] sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">{Number(invoice.amount_paid || 0) > 0 ? `${Number(invoice.payment_percentage || 0).toFixed(0)}% paid · Balance due` : "Awaiting payment"}</p><h2 className="mt-1 text-xl font-black">Pay {formatMoney(outstanding, invoice.currency)}</h2><p className="mt-1 max-w-xl text-xs leading-5 text-white/65">{hasBankTransfer ? `Use a verified ${invoice.currency} corporate account or secure Paystack checkout.` : `No ${invoice.currency} corporate account is currently listed. Continue securely with Paystack.`}</p></div>
          <button onClick={() => { setMethod("choice"); setOpen(true); }} className="h-12 shrink-0 rounded-xl bg-[#0A4FE8] px-7 text-xs font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500">Pay now</button>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-[150] grid place-items-center bg-[#06103A]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Invoice payment options">
          <div className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-[24px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0A4FE8]">Invoice payment</p><h2 className="mt-1 text-lg font-black text-[#0D1B39]">{method === "choice" ? "Choose how to pay" : "Pay by bank transfer"}</h2></div><button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button></div>

            {method === "choice" ? (
              <div className="space-y-3 p-5 sm:p-6">
                <button onClick={() => void startPaystack()} disabled={!paystackAvailable || startingPaystack} className="flex w-full items-center gap-4 rounded-2xl border-2 border-[#0A4FE8] bg-blue-50/60 p-4 text-left disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:opacity-65"><div className="grid h-12 w-12 place-items-center rounded-xl bg-[#0A4FE8] text-white"><CreditCard className="h-5 w-5" /></div><div className="flex-1"><p className="text-sm font-black text-[#0D1B39]">Paystack</p><p className="mt-1 text-xs text-slate-500">Card and secure online payment in {invoice.currency}</p></div><span className="text-xs font-bold text-[#0A4FE8]">{startingPaystack ? "Opening…" : paystackAvailable ? "Continue" : "Unavailable"}</span></button>
                {hasBankTransfer && <button onClick={() => setMethod("transfer")} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left"><div className="grid h-12 w-12 place-items-center rounded-xl bg-[#06103A] text-white"><Building2 className="h-5 w-5" /></div><div className="flex-1"><p className="text-sm font-black text-[#0D1B39]">Bank transfer</p><p className="mt-1 text-xs text-slate-500">Transfer to a verified {invoice.currency} account, then attach proof</p></div><span className="text-xs font-bold text-[#0A4FE8]">Continue</span></button>}
                {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}
                <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-[11px] leading-5 text-emerald-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />A transfer submission does not mark the invoice paid. CDS Space Finance confirms it independently.</div>
              </div>
            ) : (
              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2">{bankAccounts.map((account) => <div key={account.id || `${account.currency}-${account.bank_name}-${account.account_number || account.iban}`} className="rounded-2xl bg-[#06103A] p-4 text-white"><p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">{account.bank_name} · {account.currency}</p>{account.account_number && <p className="mt-2 font-mono text-xl font-black tracking-wide">{account.account_number}</p>}{account.iban && <p className="mt-2 break-all font-mono text-sm font-black tracking-wide">IBAN {account.iban}</p>}<p className="mt-1 text-[11px] text-white/65">{account.account_name}</p>{account.swift_bic && <p className="mt-2 text-[10px] text-white/60">SWIFT/BIC {account.swift_bic}</p>}{account.routing_number && <p className="mt-1 text-[10px] text-white/60">Routing {account.routing_number}</p>}{account.instructions && <p className="mt-2 text-[10px] leading-4 text-blue-100">{account.instructions}</p>}</div>)}</div>
                <div><label className="text-[11px] font-bold text-[#0D1B39]">Amount transferred</label><input type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100" /><p className="mt-1 text-[10px] text-slate-500">Outstanding balance: {formatMoney(outstanding, invoice.currency)}</p></div>
                <div><label className="text-[11px] font-bold text-[#0D1B39]">Transfer reference (optional)</label><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank reference or narration" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100" /></div>
                <label className="block rounded-2xl border border-dashed border-blue-300 bg-blue-50/50 p-4"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#0A4FE8]"><FileUp className="h-5 w-5" /></span><span><span className="block text-xs font-black text-[#0D1B39]">Upload proof of payment (optional)</span><span className="mt-1 block text-[10px] text-slate-500">PNG, JPG, WEBP or PDF · up to 10MB</span></span></span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="mt-3 block w-full text-[11px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#0A4FE8] file:px-3 file:py-2 file:text-[10px] file:font-bold file:text-white" onChange={(event) => setProof(event.target.files?.[0] || null)} /></label>
                {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={() => setMethod("choice")} className="h-11 rounded-xl border border-slate-200 px-5 text-xs font-bold text-slate-600">Back</button><button onClick={submitTransfer} disabled={submitting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-6 text-xs font-black text-white disabled:opacity-60">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{proof ? "Submit proof for confirmation" : "I have made the transfer"}</button></div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
