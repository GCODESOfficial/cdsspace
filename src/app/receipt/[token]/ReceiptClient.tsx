"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import ReceiptDocument from "@/components/finance/ReceiptDocument";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import type { FinanceReceipt } from "@/lib/finance/types";

export default function ReceiptClient({ token }: { token: string }) {
  const [receipt, setReceipt] = useState<FinanceReceipt | null>(null);
  const [invoiceToken, setInvoiceToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch(`/api/finance/receipt/${token}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Receipt not found.");
        setReceipt(data.receipt);
        setInvoiceToken(data.invoice_public_token || null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Receipt not found."));
  }, [token]);

  const download = async () => {
    if (!receipt) return;
    setDownloading(true);
    try {
      const { exportReceiptToPdf } = await import("@/lib/receipt-pdf");
      await exportReceiptToPdf(receipt);
    } finally {
      setDownloading(false);
    }
  };

  if (error) return <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-center"><div><h1 className="text-2xl font-black text-[#0D1B39]">Receipt not found</h1><p className="mt-2 text-sm text-slate-500">{error}</p></div></main>;
  if (!receipt) return <main className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></main>;

  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#eef4ff_0%,#ffffff_48%,#f1f6ff_100%)] px-4 py-8 sm:py-12 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-5 flex max-w-[820px] flex-wrap justify-end gap-2">
        {invoiceToken && <Link href={`/invoice/${invoiceToken}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-100 bg-white px-4 text-xs font-bold text-[#0A4FE8] shadow-sm"><ExternalLink className="h-4 w-4" />Invoice</Link>}
        <UniversalShareButton title={`Receipt ${receipt.receipt_number}`} text={`CDS Space payment receipt ${receipt.receipt_number}`} url={`/receipt/${token}`} className="h-11 rounded-xl border-blue-100 bg-white px-4 text-[#0A4FE8]" />
        <button onClick={download} disabled={downloading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-xs font-bold text-white shadow-lg shadow-blue-600/20 disabled:opacity-60">{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download receipt</button>
      </div>
      <ReceiptDocument receipt={receipt} />
    </main>
  );
}
