'use client';

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import InvoiceDocument from "@/components/finance/InvoiceDocument";
import InvoicePaymentPanel from "@/components/finance/InvoicePaymentPanel";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Download, Loader2, TicketCheck } from "lucide-react";
import type { FinanceBankAccount, FinanceInvoice, FinanceInvoiceItem, FinanceReceipt, InvoicePaymentSubmission } from "@/lib/finance/types";
import { buildInvoiceShareMessage } from "@/lib/finance/share";
import { INVOICE_VALID_DAYS, invoiceExpiryLabel, invoiceHasExpired } from "@/lib/finance/invoice-expiry";

export default function PublicInvoiceClient({ token }: { token: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);
  const [paymentSubmission, setPaymentSubmission] = useState<InvoicePaymentSubmission | null>(null);
  const [receipt, setReceipt] = useState<FinanceReceipt | null>(null);
  const [bankAccounts, setBankAccounts] = useState<FinanceBankAccount[]>([]);
  const [paystackAvailable, setPaystackAvailable] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [marketerCode, setMarketerCode] = useState("");
  const [marketerSaving, setMarketerSaving] = useState(false);
  const [marketerMessage, setMarketerMessage] = useState("");
  const [marketerError, setMarketerError] = useState("");

  const refreshInvoice = useCallback(async (initial = false) => {
    try {
      const response = await fetch(`/api/finance/invoice/${token}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Invoice not found");
      const data = await response.json();
      setInvoice(data.invoice);
      setItems(data.items ?? []);
      setPaymentSubmission(data.paymentSubmission ?? null);
      setReceipt(data.receipt ?? null);
      setBankAccounts(data.bankAccounts ?? []);
      setPaystackAvailable(data.paymentOptions?.paystack === true);
      setMarketerCode((current) => current || data.invoice?.marketer_code || "");
      setNotFound(false);
    } catch {
      if (initial) setNotFound(true);
    }
  }, [token]);

  useEffect(() => {
    void refreshInvoice(true);
    const interval = window.setInterval(() => void refreshInvoice(false), 10_000);
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refreshInvoice(false);
    };
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [refreshInvoice]);

  useEffect(() => {
    if (invoice && sp.get("print") === "1") {
      setTimeout(() => window.print(), 500);
    }
  }, [invoice, sp]);

  const handleDownload = async () => {
    if (!invoice) return;
    setIsDownloading(true);
    try {
      // Direct jsPDF render - no html2canvas, no CORS image loads, no hangs.
      // Loaded on demand so jsPDF stays out of the initial page bundle.
      const { exportInvoiceToPdf } = await import("@/lib/invoice-pdf");
      exportInvoiceToPdf(invoice, items, { bankAccounts });
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  const saveMarketerCode = async () => {
    if (!invoice || !marketerCode.trim()) return;
    setMarketerSaving(true); setMarketerError(""); setMarketerMessage("");
    const response = await fetch(`/api/finance/invoice/${token}/marketer-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: marketerCode }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setMarketerError(result.error || "Could not apply the code."); setMarketerSaving(false); return; }
    setMarketerCode(result.marketer.code);
    setInvoice({ ...invoice, marketer_code: result.marketer.code, marketer_attributed_at: result.attribution.marketer_attributed_at });
    setMarketerMessage(`${result.marketer.name} will receive a commission when this invoice is recorded as paid.`);
    setMarketerSaving(false);
  };

  const returnToPreviousPage = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  const showPaymentBackButton = invoice?.status === "paid"
    || paymentSubmission?.status === "pending"
    || paymentSubmission?.status === "confirmed";

  if (notFound) {
    return (
      <div className="min-h-screen bg-white grid place-items-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">Invoice not found</div>
          <div className="text-gray-500 mt-2">This invoice link is invalid or has been removed.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { 
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
          }
          html {
            overflow: visible !important;
            height: auto !important;
          }
          @page {
            size: auto;
            margin: 0;
          }
          /* Prevent unnecessary breaks but allow the document to grow */
          .print-container {
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            height: auto !important;
          }
        }
      `}</style>
      <div className="min-h-screen bg-[#F5F8FF] py-10 px-4 print:bg-white print:py-0 print:px-0">
        <div className={`no-print mx-auto mb-6 flex max-w-[820px] flex-col gap-3 sm:flex-row sm:items-center ${showPaymentBackButton ? "sm:justify-between" : "sm:justify-end"}`}>
          {showPaymentBackButton && (
            <Button
              type="button"
              variant="outline"
              onClick={returnToPreviousPage}
              className="h-11 justify-center border-blue-200 px-4 text-blue-700 hover:bg-blue-50 sm:justify-start"
            >
              <ArrowLeft className="h-4 w-4" /> Previous page
            </Button>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <UniversalShareButton
              title={`Invoice ${invoice?.invoice_number || ""}`.trim()}
              text={buildInvoiceShareMessage(invoice?.invoice_number, "").trim()}
              url={`/invoice/${token}`}
              className="h-11 px-5 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"
            />
            <Button
              onClick={handleDownload}
              disabled={isDownloading}
              className="h-11 px-5 rounded-xl bg-[#0A4FE8] shadow-lg shadow-blue-600/30 disabled:opacity-70"
            >
              {isDownloading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                <span className="flex items-center">
                  <Download className="w-4 h-4 mr-1.5" /> Download PDF
                </span>
              )}
            </Button>
          </div>
        </div>
        {invoice?.auto_cancel_at && invoice.status !== "paid" && invoice.status !== "cancelled" && (
          <section className="no-print mx-auto mb-6 max-w-[820px] rounded-[16px] border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-[13px] font-semibold text-amber-900">
              This invoice is valid until {invoiceExpiryLabel(invoice.auto_cancel_at)}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-amber-800">
              This invoice remains valid for {INVOICE_VALID_DAYS} days from the date it was issued. We kindly ask that
              payment be completed within this period. If you have any questions or need assistance, please contact
              us, and we will be happy to help.
            </p>
          </section>
        )}
        {invoice?.status === "cancelled" && invoice.auto_cancel_at && invoiceHasExpired(invoice.auto_cancel_at) && (
          <section className="no-print mx-auto mb-6 max-w-[820px] rounded-[16px] border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-[13px] font-semibold text-slate-700">
              This invoice expired on {invoiceExpiryLabel(invoice.auto_cancel_at)} and has been cancelled.
            </p>
            <p className="mt-1 text-[12px] leading-5 text-slate-600">
              Contact CDS Space if you would still like to go ahead, and a fresh invoice will be raised.
            </p>
          </section>
        )}
        {invoice && (
          <InvoicePaymentPanel
            token={token}
            invoice={invoice}
            submission={paymentSubmission}
            receipt={receipt}
            bankAccounts={bankAccounts}
            paystackAvailable={paystackAvailable}
            onSubmitted={setPaymentSubmission}
          />
        )}
        {invoice && invoice.status !== "paid" && invoice.status !== "cancelled" && paymentSubmission?.status !== "pending" && paymentSubmission?.status !== "confirmed" && (
          <section className="no-print mx-auto mb-6 max-w-[820px] rounded-[16px] border border-blue-100 bg-white p-5 shadow-[0_12px_34px_rgba(15,40,90,0.07)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[#0D1B39]"><TicketCheck className="size-5 text-blue-600" /><h2 className="text-[14px] font-semibold">Were you referred by a CDS Space Brand Marketer?</h2></div>
                <p className="mt-1.5 text-[11px] leading-5 text-gray-500">Enter their code before payment. Once this invoice is paid, a commission is credited to that marketer.</p>
                <input value={marketerCode} onChange={(event) => { setMarketerCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setMarketerError(""); setMarketerMessage(""); }} placeholder="e.g. CHRIS" className="mt-3 h-11 w-full rounded-[12px] border border-gray-200 px-4 font-mono text-[13px] font-bold tracking-[.08em] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <button onClick={saveMarketerCode} disabled={marketerSaving || !marketerCode} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-5 text-[12px] font-semibold text-white disabled:opacity-50">{marketerSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{invoice.marketer_code ? "Update code" : "Apply code"}</button>
            </div>
            {marketerMessage && <p className="mt-3 rounded-[10px] bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">{marketerMessage}</p>}
            {marketerError && <p className="mt-3 rounded-[10px] bg-red-50 px-3 py-2 text-[11px] font-medium text-red-600">{marketerError}</p>}
            {invoice.marketer_code && !marketerMessage && <p className="mt-3 rounded-[10px] bg-blue-50 px-3 py-2 text-[11px] font-medium text-blue-700">Marketer code <span className="font-mono font-bold">{invoice.marketer_code}</span> is attached to this invoice.</p>}
          </section>
        )}
        <div id="invoice-capture" className="print-container mx-auto">
          {invoice && <InvoiceDocument invoice={invoice} items={items} bankAccounts={bankAccounts} />}
        </div>
      </div>
      <div className="no-print"><Footer /></div>
    </>
  );
}
