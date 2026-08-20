"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Download, ExternalLink, FileText, Loader2, ReceiptText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFinanceDate, formatMoney, type Currency } from "@/lib/finance/types";
import { useClientAccount } from "@/components/dashboard/ClientAccountProvider";

interface ClientInvoice {
  id: string;
  invoice_number: string;
  total: number;
  currency: Currency;
  status: string;
  issue_date: string;
  due_date: string | null;
  public_token: string;
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  sent: "bg-blue-50 text-blue-700",
  overdue: "bg-red-50 text-red-700",
  draft: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function ClientInvoicesPage() {
  const { account } = useClientAccount();
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (initial = false) => {
      if (initial) setLoading(true);
      const db = createClient();
      const { data } = await db
        .from("finance_invoices")
        .select("id, invoice_number, total, currency, status, issue_date, due_date, public_token")
        .eq("user_id", account.userId)
        .order("issue_date", { ascending: false });
      setInvoices((data || []) as ClientInvoice[]);
      setLoading(false);
  }, [account.userId]);

  useEffect(() => {
    void load(true);
    const interval = window.setInterval(() => void load(false), 15_000);
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [load]);

  return (
    <div className="mx-auto max-w-[1400px] p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight text-brand-navy lg:text-[34px]">My Invoices</h1>
        <p className="mt-1 text-sm text-gray-500">Invoices linked securely to your account ID.</p>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-white/70 bg-white/80 shadow-[0_10px_40px_rgba(15,40,90,0.05)] backdrop-blur-xl">
        {loading ? (
          <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-blue" /></div>
        ) : invoices.length === 0 ? (
          <div className="grid min-h-64 place-items-center px-6 text-center">
            <div><ReceiptText className="mx-auto mb-3 h-10 w-10 text-brand-stroke" /><p className="text-sm text-gray-500">No invoices are linked to this account yet.</p></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b border-brand-stroke/10 text-[11px] font-semibold uppercase tracking-wider text-brand-mute">
                <tr><th className="px-6 py-3">Invoice</th><th className="px-5 py-3">Issued</th><th className="px-5 py-3">Due</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-brand-stroke/10">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="text-[13px] transition hover:bg-blue-50/30">
                    <td className="px-6 py-4 font-semibold text-brand-navy"><span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-brand-blue" />{invoice.invoice_number}</span></td>
                    <td className="px-5 py-4 text-gray-500">{formatFinanceDate(invoice.issue_date)}</td>
                    <td className="px-5 py-4 text-gray-500">{formatFinanceDate(invoice.due_date)}</td>
                    <td className="px-5 py-4"><span className={`rounded-[8px] px-2.5 py-1 text-[11px] font-semibold capitalize ${STATUS_STYLES[invoice.status] || "bg-gray-100 text-gray-600"}`}>{invoice.status}</span></td>
                    <td className="px-5 py-4 text-right font-semibold text-brand-navy">{formatMoney(invoice.total, invoice.currency)}</td>
                    <td className="px-5 py-4 text-right"><div className="flex items-center justify-end gap-2">{invoice.status === "paid" ? <Link href={`/invoice/${invoice.public_token}#payment`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-emerald-50 px-3 text-[11px] font-bold text-emerald-700"><Download className="h-3.5 w-3.5" />Receipt</Link> : invoice.status !== "cancelled" && invoice.status !== "draft" ? <Link href={`/invoice/${invoice.public_token}#payment`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-blue-600 px-3 text-[11px] font-bold text-white"><CreditCard className="h-3.5 w-3.5" />Pay now</Link> : null}<Link href={`/invoice/${invoice.public_token}`} target="_blank" aria-label={`Open ${invoice.invoice_number}`} className="inline-grid h-9 w-9 place-items-center rounded-[8px] text-brand-mute transition hover:bg-blue-50 hover:text-brand-blue"><ExternalLink className="h-4 w-4" /></Link></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
