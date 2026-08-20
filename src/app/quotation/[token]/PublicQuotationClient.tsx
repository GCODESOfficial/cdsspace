'use client';

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import QuotationDocument from "@/components/finance/QuotationDocument";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { FinanceQuotation, FinanceQuotationItem, FinanceQuotationSample } from "@/lib/finance/types";
import { buildQuotationShareMessage } from "@/lib/finance/share";

export default function PublicQuotationClient({ token }: { token: string }) {
  const sp = useSearchParams();
  const [quotation, setQuotation] = useState<FinanceQuotation | null>(null);
  const [items, setItems] = useState<FinanceQuotationItem[]>([]);
  const [samples, setSamples] = useState<FinanceQuotationSample[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    fetch(`/api/finance/quotation/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => {
        setQuotation(d.quotation);
        setItems(d.items ?? []);
        setSamples(d.samples ?? []);
      })
      .catch(() => setNotFound(true));
  }, [token]);

  useEffect(() => {
    if (quotation && sp.get("print") === "1") {
      setTimeout(() => window.print(), 500);
    }
  }, [quotation, sp]);

  const handleDownload = async () => {
    if (!quotation) return;
    setIsDownloading(true);
    try {
      const { exportQuotationToPdf } = await import("@/lib/quotation-pdf");
      await exportQuotationToPdf(quotation, items, samples);
    } catch (error) {
      console.error("Failed to generate quotation PDF:", error);
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-white grid place-items-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">Quotation not found</div>
          <div className="text-gray-500 mt-2">This quotation link is invalid or has been removed.</div>
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
          .print-container {
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            height: auto !important;
          }
        }
      `}</style>
      <div className="min-h-screen bg-[#F5F8FF] py-10 px-4 print:bg-white print:py-0 print:px-0">
        <div className="max-w-[820px] mx-auto mb-6 flex justify-end gap-2 no-print">
          <UniversalShareButton
            title={`Quotation ${quotation?.quotation_number || ""}`.trim()}
            text={buildQuotationShareMessage(quotation?.quotation_number, "").trim()}
            url={`/quotation/${token}`}
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
        <div id="quotation-capture" className="print-container mx-auto">
          {quotation && <QuotationDocument quotation={quotation} items={items} samples={samples} />}
        </div>
      </div>
      <div className="no-print"><Footer /></div>
    </>
  );
}
