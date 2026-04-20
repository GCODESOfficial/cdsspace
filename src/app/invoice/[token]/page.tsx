'use client';

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import InvoiceDocument from "@/components/finance/InvoiceDocument";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { FinanceInvoice, FinanceInvoiceItem } from "@/lib/finance/types";

export default function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const sp = useSearchParams();
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/finance/invoice/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => { setInvoice(d.invoice); setItems(d.items ?? []); })
      .catch(() => setNotFound(true));
  }, [token]);

  useEffect(() => {
    if (invoice && sp.get("print") === "1") {
      setTimeout(() => window.print(), 500);
    }
  }, [invoice, sp]);

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
          body { background: white !important; }
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 py-10 px-4 print:bg-white print:py-0 print:px-0">
        <div className="max-w-[820px] mx-auto mb-6 flex justify-end no-print">
          <Button onClick={() => window.print()} className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30">
            <Download className="w-4 h-4 mr-1.5" /> Download PDF
          </Button>
        </div>
        {invoice && <InvoiceDocument invoice={invoice} items={items} />}
      </div>
      <div className="no-print"><Footer /></div>
    </>
  );
}
