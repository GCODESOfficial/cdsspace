"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ExternalLink, ReceiptText } from "lucide-react";

interface BannerStudioSuccessModalProps {
  isOpen: boolean;
  invoiceUrl: string | null;
  quotationNumber?: string | null;
  onClose: () => void;
}

export const BannerStudioSuccessModal = ({ isOpen, invoiceUrl, quotationNumber, onClose }: BannerStudioSuccessModalProps) => {
  const awaitingQuote = Boolean(quotationNumber && !invoiceUrl);
  return (
  <AnimatePresence>
    {isOpen && <>
      <motion.button type="button" aria-label="Close banner confirmation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[100] bg-[#07133B]/35 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 z-[101] grid place-items-center p-4">
        <motion.section initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.97 }} className="pointer-events-auto w-full max-w-[520px] overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_35px_90px_rgba(7,19,59,0.25)]">
          <div className="bg-[#0A4FE8] px-7 py-8 text-white">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><CheckCircle2 className="h-7 w-7" /></span>
            <h2 className="mt-5 text-[25px] font-bold tracking-tight">{awaitingQuote ? "Custom banner request submitted" : "Banner invoice ready"}</h2>
            <p className="mt-2 text-[12px] leading-5 text-blue-100">{awaitingQuote ? "Your custom dimensions and artwork instructions have been sent to CDS Space for production and logistics pricing." : "Your request is saved as awaiting payment. It will enter the pending production queue only after payment is confirmed."}</p>
          </div>
          <div className="space-y-4 p-6">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-[#0A4FE8]" /><div><p className="text-[13px] font-bold text-[#0D1B39]">{awaitingQuote ? `${quotationNumber} is awaiting pricing` : "Your invoice is ready"}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{awaitingQuote ? "No price has been charged. Once the team confirms the real production, design and delivery costs, the converted invoice will appear in My Invoices for payment." : "Standard production is 3 business days. If delivery was tentative, logistics remains excluded and will be billed separately."}</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={onClose} className="h-12 rounded-2xl border border-slate-200 text-[12px] font-bold text-[#0D1B39] hover:bg-slate-50">Back to banners</button>
              {invoiceUrl && <Link href={invoiceUrl} target="_blank" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0A4FE8] text-[12px] font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-[#083FC0]">View invoice <ExternalLink className="h-4 w-4" /></Link>}
            </div>
          </div>
        </motion.section>
      </div>
    </>}
  </AnimatePresence>
  );
};
