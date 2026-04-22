'use client';

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import InvoiceDocument from "@/components/finance/InvoiceDocument";
import { Button } from "@/components/ui/button";
import { Download, Share2 } from "lucide-react";
import type { FinanceInvoice, FinanceInvoiceItem } from "@/lib/finance/types";

export default function PublicInvoiceClient({ token }: { token: string }) {
  const sp = useSearchParams();
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

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

  const handleDownload = async () => {
    if (!invoice) return;
    const element = document.getElementById("invoice-capture");
    if (!element) return;
    
    setIsDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;
      
      // Capture the element
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdfW = 210; // A4 mm
      const pdfH = (canvas.height * pdfW) / canvas.width;
      
      // Create PDF with custom height for "single page" feel
      const doc = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: [pdfW, pdfH]
      });
      
      doc.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      doc.save(`Invoice-${invoice.invoice_number}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      // Fallback to print if library fails
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 py-10 px-4 print:bg-white print:py-0 print:px-0">
        <div className="max-w-[820px] mx-auto mb-6 flex justify-end gap-2 no-print">
          <Button 
            variant="outline"
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: `Invoice ${invoice?.invoice_number || ""}`,
                  text: `View invoice from CDS Space for ${invoice?.client_name || ""}`,
                  url: window.location.href,
                }).catch(() => {});
              } else {
                navigator.clipboard.writeText(window.location.href);
                alert("Link copied to clipboard!");
              }
            }}
            className="h-11 px-5 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            <Share2 className="w-4 h-4 mr-1.5" /> Share
          </Button>
          <Button 
            onClick={handleDownload} 
            disabled={isDownloading}
            className="h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30 disabled:opacity-70"
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
        <div id="invoice-capture" className="print-container mx-auto">
          {invoice && <InvoiceDocument invoice={invoice} items={items} />}
        </div>
      </div>
      <div className="no-print"><Footer /></div>
    </>
  );
}
