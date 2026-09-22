'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Search, CheckCircle2, Clock, Send, Trash2, X, Check, Copy, Share2, Mail, Loader2, BellRing, RotateCcw, ShieldCheck } from "lucide-react";
import FinanceShell, { glassCard } from "@/components/finance/FinanceShell";
import StatCard from "@/components/finance/StatCard";
import ActivityPanel from "@/components/admin/ActivityPanel";
import { Currency, formatFinanceDate, formatMoney } from "@/lib/finance/types";
import { buildInvoiceShareMessage } from "@/lib/finance/share";
import { appAlert, appConfirm, appPrompt, appToast } from "@/lib/app-notify";
import CreateProjectFromInvoiceModal, { type InvoiceForProject } from "@/components/finance/CreateProjectFromInvoiceModal";
import { useFinanceDisplayCurrency } from "@/components/finance/FinanceCurrencySelector";
import { convertFinanceAmount } from "@/lib/finance/currency-display";
import RecordInvoicePaymentModal from "@/components/finance/RecordInvoicePaymentModal";

interface Row {
  id: string; invoice_number: string; client_name: string; currency: Currency;
  client_email: string | null;
  total: number; status: string; issue_date: string; due_date: string | null;
  amount_paid?: number; balance_due?: number; payment_percentage?: number;
  finance_projects?: { name: string; client: string } | null;
  invoice_payment_submissions?: Array<{ id: string; status: string; submitted_at: string; method: string }>;
  deleted_at?: string | null; deletion_reason?: string | null; deleted_by?: string | null;
}

const STATUS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
  sent:      "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  partially_paid: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  paid:      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  overdue:   "bg-red-50 text-red-700 ring-1 ring-red-200",
  cancelled: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

export default function InvoicesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [projectPrompt, setProjectPrompt] = useState<InvoiceForProject | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Row | null>(null);
  const { currency: displayCurrency, rates } = useFinanceDisplayCurrency();

  const load = (archived = showArchived) => {
    setLoading(true);
    fetch(`/api/admin/finance/invoices${archived ? "?archived=1" : ""}`).then((r) => r.json()).then((d) => { setRows(d.invoices ?? []); setLoading(false); });
  };
  useEffect(() => {
    load(false);
    fetch("/api/admin-check", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => setIsSuperAdmin(data?.role === "super_admin")).catch(() => undefined);
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      fetch(`/api/admin/finance/invoices${showArchived ? "?archived=1" : ""}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => { if (data?.invoices) setRows(data.invoices); })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [showArchived]);

  const confirmPayment = async (row: Row, submissionId: string) => {
    if (!(await appConfirm(`Confirm this payment for ${row.invoice_number}? The invoice balance will update automatically.`))) return;
    setConfirmingId(row.id);
    try {
      const response = await fetch(`/api/admin/finance/invoices/${row.id}/payment/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Payment confirmation failed.");
      appToast({ message: data.invoice?.status === "paid" ? "Payment confirmed and receipt issued." : "Part payment confirmed and balance updated.", kind: "success" });
      load();
      if (!row.finance_projects && data.invoice && !data.invoice.project_id) {
        setProjectPrompt(data.invoice as InvoiceForProject);
      }
    } catch (reason) {
      appAlert(reason instanceof Error ? reason.message : "Payment confirmation failed.");
    } finally {
      setConfirmingId(null);
    }
  };

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = (ids: string[]) => {
    setSelected((s) => {
      if (ids.every((id) => s.has(id))) return new Set();
      return new Set(ids);
    });
  };
  const clearSelection = () => setSelected(new Set());

  const bulkPatch = async (status: string) => {
    setWorking(true);
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/admin/finance/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
      )
    );
    setWorking(false); clearSelection(); load();
  };
  const bulkDelete = async () => {
    if (!isSuperAdmin) return void appAlert("Only a super admin can archive invoices.");
    const reason = await appPrompt(`Why are you archiving ${selected.size} invoice${selected.size === 1 ? "" : "s"}? This reason will remain in the audit log.`);
    if (!reason?.trim()) return;
    setWorking(true);
    const responses = await Promise.all(Array.from(selected).map((id) => fetch(`/api/admin/finance/invoices/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }),
    })));
    if (responses.some((response) => !response.ok)) appAlert("One or more invoices could not be archived.");
    setWorking(false); clearSelection(); load();
  };

  const restoreInvoice = async (id: string) => {
    const response = await fetch(`/api/admin/finance/invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: true }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return void appAlert(payload.error || "Could not restore this invoice.");
    appToast({ message: "Invoice restored to the active list.", kind: "success" });
    load(true);
  };

  const bulkDuplicate = async () => {
    setWorking(true);
    try {
      for (const id of selected) {
        const res = await fetch(`/api/admin/finance/invoices/${id}`);
        const { invoice, items } = await res.json();
        
        // Prepare duplication payload
        const payload = {
          ...invoice,
          id: undefined,
          invoice_number: undefined,
          created_at: undefined,
          public_token: undefined,
          status: "draft",
          items: items.map((it: any) => ({
            name: it.name, description: it.description, quantity: it.quantity, unit_price: it.unit_price, position: it.position
          }))
        };
        
        await fetch("/api/admin/finance/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }
      appAlert(`Duplicated ${selected.size} invoice(s) as drafts.`);
    } catch (e) {
      console.error("Duplication failed", e);
      appAlert("Failed to duplicate some invoices");
    }
    setWorking(false); clearSelection(); load();
  };

  const bulkShare = async () => {
    const messages: string[] = [];
    const origin = window.location.origin;
    let skipped = 0;
    
    for (const id of selected) {
      const res = await fetch(`/api/admin/finance/invoices/${id}`);
      const { invoice, items } = await res.json();
      const complete = invoice
        && Number(invoice.total) > 0
        && Array.isArray(items)
        && items.some((item: { name?: string; quantity?: number }) => Boolean(item.name?.trim()) && Number(item.quantity) > 0);
      if (complete && invoice.public_token) {
        messages.push(
          buildInvoiceShareMessage(invoice.invoice_number, `${origin}/invoice/${invoice.public_token}`)
        );
      } else {
        skipped++;
      }
    }
    
    if (messages.length > 0) {
      await navigator.clipboard.writeText(messages.join("\n\n"));
      appAlert(`${messages.length} invoice share message(s) copied to clipboard${skipped ? ` · ${skipped} incomplete invoice${skipped === 1 ? " was" : "s were"} skipped` : ""}.`);
    } else if (skipped) {
      appAlert("Complete and save the selected invoice before sharing it.");
    }
    clearSelection();
  };

  // Email a single invoice to its stored client email (endpoint uses client_email).
  const emailInvoice = async (id: string) => {
    setEmailingId(id);
    try {
      const r = await fetch("/api/admin/finance/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "invoice", id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed to send");
      appToast({ message: `Invoice emailed to ${j.to}`, kind: "success" });
      load();
    } catch (e) {
      appAlert(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setEmailingId(null);
    }
  };

  const bulkEmail = async () => {
    setWorking(true);
    let sent = 0;
    let failed = 0;
    await Promise.all(
      Array.from(selected).map(async (id) => {
        try {
          const r = await fetch("/api/admin/finance/share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "invoice", id }),
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.ok) sent++; else failed++;
        } catch {
          failed++;
        }
      }),
    );
    setWorking(false);
    clearSelection();
    appAlert(`Emailed ${sent} invoice${sent === 1 ? "" : "s"}${failed ? ` · ${failed} skipped (no client email?)` : ""}.`);
  };

  const remindPayment = async (row: Row) => {
    if (!(await appConfirm(`Send ${row.client_name} a payment reminder for ${row.invoice_number} by client chat and email?`))) return;
    setRemindingId(row.id);
    try {
      const response = await fetch(`/api/admin/finance/invoices/${row.id}/reminder`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not send the payment reminder.");
      const channels = [data.chat_sent ? "client chat" : null, data.email_sent ? "email" : null].filter(Boolean).join(" and ");
      appToast({ message: `Payment reminder sent by ${channels || "the available channel"}.`, kind: "success" });
      if (data.warning) appAlert(`Chat was sent, but email delivery reported: ${data.warning}`);
    } catch (reason) {
      appAlert(reason instanceof Error ? reason.message : "Could not send the payment reminder.");
    } finally {
      setRemindingId(null);
    }
  };

  const filtered = rows.filter((r) =>
    r.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    r.client_name.toLowerCase().includes(search.toLowerCase())
  );
  const pendingValidation = showArchived ? [] : filtered.filter((row) => (row.invoice_payment_submissions || []).some((submission) => submission.status === "pending"));
  const tableRows = filtered;

  const totals = rows.reduce(
    (acc, r) => {
      const paid = r.amount_paid == null ? (r.status === "paid" ? r.total : 0) : r.amount_paid;
      const balance = r.balance_due == null
        ? Math.max(Number(r.total) - Number(paid || 0), 0)
        : r.balance_due;
      acc.paid += convertFinanceAmount(paid, r.currency, displayCurrency, rates);
      if (r.status !== "cancelled") {
        acc.outstanding += convertFinanceAmount(balance, r.currency, displayCurrency, rates);
      }
      return acc;
    },
    { paid: 0, outstanding: 0 }
  );

  return (
    <FinanceShell
      title="Invoices"
      subtitle="Generate, send & track invoices."
      actions={
        <Link href="/admin/finance/invoices/new">
          <Button className="h-11 rounded-xl bg-[#0A4FE8] px-5 shadow-lg shadow-blue-600/20 hover:bg-[#083FC2]">
            <Plus className="w-4 h-4 mr-1.5" /> New Invoice
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatCard icon={FileText} label="Total Invoices" value={String(rows.length)} accent="bg-[#0A4FE8]" />
        <StatCard icon={CheckCircle2} label={`Paid · ${displayCurrency}`} value={formatMoney(totals.paid, displayCurrency)} accent="from-emerald-500 to-teal-500" />
        <StatCard icon={Clock} label={`Outstanding · ${displayCurrency}`} value={formatMoney(totals.outstanding, displayCurrency)} accent="from-amber-500 to-orange-500" />
      </div>

      <div className={`${glassCard} p-4 mb-6 flex items-center gap-3`}>
        <Search className="w-5 h-5 text-gray-400 ml-2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice number or client…" className="flex-1 bg-transparent outline-none text-sm" />
        {isSuperAdmin && <button type="button" onClick={() => { const next = !showArchived; setShowArchived(next); clearSelection(); load(next); }} className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-semibold ${showArchived ? "bg-[#0A4FE8] text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{showArchived ? "View active" : "View archived"}</button>}
      </div>

      {loading ? (
        <div className={`${glassCard} p-10 text-center text-gray-500`}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={`${glassCard} p-14 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 grid place-items-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No invoices yet</h3>
          <p className="text-gray-500 mt-1">Create your first invoice to get started.</p>
        </div>
      ) : (
        <>
          {pendingValidation.length > 0 && (
            <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-amber-900"><ShieldCheck className="h-5 w-5" /><h2 className="text-sm font-bold">Client payments awaiting admin validation</h2><span className="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold">{pendingValidation.length}</span></div>
              <div className="space-y-2">{pendingValidation.map((row) => <div key={row.id} className="flex flex-col gap-3 rounded-xl bg-white p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-bold text-[#0D1B39]">{row.invoice_number} · {row.client_name}</p><p className="text-[11px] text-slate-500">{formatMoney(row.total, row.currency)} · Payment submitted by client · awaiting verification</p></div>
                <Link href={`/admin/finance/invoices/${row.id}#payment-verification`} className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-amber-600">Verify now</Link>
              </div>)}</div>
            </section>
          )}
          {selected.size > 0 && (
            <div className={`${glassCard} p-3 mb-4 flex items-center gap-3 border border-blue-200 bg-blue-50/60`}>
              <div className="flex items-center gap-2 px-2">
                <span className="w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-bold grid place-items-center">{selected.size}</span>
                <span className="text-sm font-medium text-gray-700">selected</span>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <button disabled={working} onClick={() => bulkPatch("paid")} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Mark Paid
                </button>
                <button disabled={working} onClick={() => bulkPatch("sent")} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Mark Sent
                </button>
                <button disabled={working} onClick={() => bulkPatch("cancelled")} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 transition disabled:opacity-50">
                  Cancel
                </button>
                <div className="w-[1px] h-6 bg-gray-200 mx-1" />
                <button disabled={working} onClick={bulkDuplicate} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </button>
                <button disabled={working} onClick={bulkEmail} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
                <button disabled={working} onClick={bulkShare} className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5" /> Copy Messages
                </button>
                {isSuperAdmin && !showArchived && <button disabled={working} onClick={bulkDelete} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 transition disabled:opacity-50 inline-flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>}
                <button onClick={clearSelection} className="w-8 h-8 rounded-lg hover:bg-white/70 grid place-items-center text-gray-500 hover:text-gray-800">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className={`${glassCard} overflow-x-auto`}>
            <table className="w-full min-w-[820px] table-fixed text-sm">
              <thead className="bg-white/50">
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="pl-5 pr-2 py-4 w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={tableRows.length > 0 && tableRows.every((r) => selected.has(r.id))}
                      onChange={() => toggleAll(tableRows.map((r) => r.id))}
                    />
                  </th>
                  <th className="px-5 py-4">Invoice</th>
                  <th className="w-[145px] px-3 py-4">Client</th>
                  <th className="px-5 py-4">Issued</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => {
                  const isSel = selected.has(r.id);
                  const pendingVerification = (r.invoice_payment_submissions || []).find((submission) => submission.status === "pending");
                  return (
                    <tr key={r.id} className={`border-t border-white/60 transition ${isSel ? "bg-blue-50/60" : "hover:bg-white/50"}`}>
                      <td className="pl-5 pr-2 py-4">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={isSel}
                          onChange={() => toggleOne(r.id)}
                        />
                      </td>
                      <td className="px-5 py-4 font-mono font-semibold text-gray-900">{r.invoice_number}</td>
                      <td className="w-[145px] max-w-[145px] px-3 py-4"><p className="truncate" title={r.client_name}>{r.client_name}</p></td>
                      <td className="px-5 py-4 text-gray-500">{formatFinanceDate(r.issue_date)}</td>
                      <td className="px-5 py-4 font-semibold"><span>{formatMoney(convertFinanceAmount(r.total, r.currency, displayCurrency, rates), displayCurrency)}</span>{r.currency !== displayCurrency && <small className="block truncate text-[9px] font-medium text-slate-400">Original: {formatMoney(r.total, r.currency)}</small>}{Number(r.amount_paid || 0) > 0 && <div className="mt-1.5"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#0A4FE8]" style={{ width: `${Math.min(100, Number(r.payment_percentage || 0))}%` }} /></div><small className="mt-1 block text-[9px] font-medium text-emerald-700">{Number(r.payment_percentage || 0).toFixed(0)}% paid · {formatMoney(r.balance_due ?? Math.max(Number(r.total) - Number(r.amount_paid || 0), 0), r.currency)} due</small></div>}</td>
                      <td className="px-5 py-4">
                        {pendingVerification ? (
                          <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200" title={`Submitted ${formatFinanceDate(pendingVerification.submitted_at)}`}>Payment submitted</span>
                        ) : (
                          <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${STATUS[r.status] ?? STATUS.draft}`}>{r.status}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {showArchived ? (
                            <button type="button" onClick={() => void restoreInvoice(r.id)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#0A4FE8] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#083FC2]"><RotateCcw className="h-3.5 w-3.5" />Restore</button>
                          ) : pendingVerification?.method === "paystack" ? (
                            <span className="whitespace-nowrap rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700">Awaiting Paystack</span>
                          ) : pendingVerification && (
                            <button
                              type="button"
                              onClick={() => void confirmPayment(r, pendingVerification.id)}
                              disabled={confirmingId === r.id}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {confirmingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirm
                            </button>
                          )}
                          {!showArchived && !pendingVerification && r.status !== "paid" && r.status !== "cancelled" && (
                            <button
                              onClick={() => setPaymentInvoice(r)}
                              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition"
                            >
                              Record payment
                            </button>
                          )}
                          {!showArchived && !pendingVerification && ["sent", "partially_paid", "overdue"].includes(r.status) && (
                            <button
                              onClick={() => void remindPayment(r)}
                              disabled={remindingId === r.id}
                              title="Send payment reminder by client chat and email"
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100 disabled:opacity-50"
                            >
                              {remindingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />} Reminder
                            </button>
                          )}
                          {!showArchived && <button
                            onClick={() => emailInvoice(r.id)}
                            disabled={emailingId === r.id || !r.client_email || Number(r.total) <= 0 || r.status === "cancelled"}
                            title={!r.client_email || Number(r.total) <= 0 ? "Complete and save the invoice before emailing it" : "Email the saved invoice to the client"}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 transition disabled:opacity-50"
                          >
                            {emailingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Email
                          </button>}
                          <Link href={`/admin/finance/invoices/${r.id}`} className="whitespace-nowrap text-xs font-medium text-blue-600 hover:underline">Open →</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ActivityPanel page="finance/invoices" title="Invoice activity" />
        </>
      )}
      {paymentInvoice && (
        <RecordInvoicePaymentModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onRecorded={(updated, fullyPaid) => {
            const current = paymentInvoice;
            setPaymentInvoice(null);
            load();
            appToast({ message: fullyPaid ? "Invoice paid in full." : "Part payment recorded.", kind: "success" });
            if (fullyPaid && current && !current.finance_projects) setProjectPrompt(updated as unknown as InvoiceForProject);
          }}
        />
      )}

      {projectPrompt && (
        <CreateProjectFromInvoiceModal
          invoice={projectPrompt}
          onClose={() => setProjectPrompt(null)}
          onCreated={() => { setProjectPrompt(null); load(); appAlert("Project created from invoice."); }}
        />
      )}
    </FinanceShell>
  );
}
