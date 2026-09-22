"use client";

import { useMemo, useState } from "react";
import { Banknote, Loader2, X } from "lucide-react";
import { formatMoney, type Currency } from "@/lib/finance/types";

export default function RecordInvoicePaymentModal({
  invoice,
  onClose,
  onRecorded,
}: {
  invoice: { id: string; invoice_number: string; client_name: string; total: number; amount_paid?: number; balance_due?: number; currency: Currency };
  onClose: () => void;
  onRecorded: (invoice: Record<string, unknown>, fullyPaid: boolean) => void;
}) {
  const outstanding = useMemo(
    () => Math.max(Number(invoice.balance_due ?? Number(invoice.total) - Number(invoice.amount_paid || 0)), 0),
    [invoice.amount_paid, invoice.balance_due, invoice.total],
  );
  const [amount, setAmount] = useState(String(outstanding));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const numericAmount = Number(amount);
  const remaining = Number.isFinite(numericAmount) ? Math.max(outstanding - numericAmount, 0) : outstanding;
  const resultingPercentage = invoice.total > 0
    ? Math.min(100, ((Number(invoice.amount_paid || 0) + (Number.isFinite(numericAmount) ? numericAmount : 0)) / Number(invoice.total)) * 100)
    : 0;

  const submit = async () => {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > outstanding + 0.01) {
      setError(`Enter an amount between 0.01 and ${formatMoney(outstanding, invoice.currency)}.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/finance/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_amount: numericAmount,
          paid_on: paidOn,
          payment_method: method,
          payment_reference: reference.trim() || null,
          payment_note: note.trim() || null,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Payment could not be recorded.");
      onRecorded(data.invoice, Boolean(data.fully_paid));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment could not be recorded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[160] grid place-items-center bg-[#06103A]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Record invoice payment" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div><p className="text-xs font-semibold text-[#0A4FE8]">{invoice.invoice_number}</p><h2 className="mt-1 text-lg font-bold text-[#0D1B39]">Record payment</h2><p className="mt-1 text-xs text-gray-500">{invoice.client_name}</p></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-gray-100 text-gray-500" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-blue-50 p-3 text-center">
            <div><p className="text-[10px] text-gray-500">Invoice</p><p className="mt-1 text-xs font-bold text-[#0D1B39]">{formatMoney(invoice.total, invoice.currency)}</p></div>
            <div><p className="text-[10px] text-gray-500">Paid</p><p className="mt-1 text-xs font-bold text-emerald-700">{formatMoney(invoice.amount_paid || 0, invoice.currency)}</p></div>
            <div><p className="text-[10px] text-gray-500">Outstanding</p><p className="mt-1 text-xs font-bold text-amber-700">{formatMoney(outstanding, invoice.currency)}</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Amount received</span><input autoFocus type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
            <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Payment date</span><input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
            <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0A4FE8]"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="paystack">Paystack</option><option value="card">Card / POS</option><option value="other">Other</option></select></label>
            <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional bank reference" className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#0A4FE8]" /></label>
          </div>
          <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Note</span><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional reconciliation note" className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#0A4FE8]" /></label>
          <div className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between text-xs"><span className="text-gray-500">After this payment</span><span className="font-bold text-[#0D1B39]">{resultingPercentage.toFixed(0)}% paid</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#0A4FE8]" style={{ width: `${resultingPercentage}%` }} /></div>
            <p className="mt-2 text-xs text-gray-500">Remaining balance: <span className="font-semibold text-[#0D1B39]">{formatMoney(remaining, invoice.currency)}</span></p>
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <button type="button" onClick={submit} disabled={busy || outstanding <= 0} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}Record payment</button>
        </div>
      </div>
    </div>
  );
}
