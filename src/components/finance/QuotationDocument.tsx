'use client';

import type { CSSProperties } from "react";
import {
  Currency,
  DEFAULT_QUOTATION_ESTIMATE_NOTE,
  DEFAULT_REVISIONS_NOTE,
  DEFAULT_WORKING_HOURS,
  formatFinanceDate,
  formatMoney,
  type FinanceQuotationSample,
} from "@/lib/finance/types";

interface Item {
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Quotation {
  quotation_number: string;
  project_name: string;
  client_name: string;
  client_email: string | null;
  client_address: string | null;
  currency: Currency;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total: number;
  status: string;
  issue_date: string;
  valid_until: string | null;
  notes: string | null;
  estimate_note?: string | null;
  revisions_note?: string | null;
  working_hours?: string | null;
  delivery_period?: string | null;
}

const STATUS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  converted: "bg-purple-50 text-purple-700",
  cancelled: "bg-slate-100 text-slate-600",
};

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function QuotationDocument({
  quotation,
  items,
  samples = [],
}: {
  quotation: Quotation;
  items: Item[];
  samples?: FinanceQuotationSample[];
}) {
  const estimateNote = quotation.estimate_note || DEFAULT_QUOTATION_ESTIMATE_NOTE;
  const revisions = quotation.revisions_note || DEFAULT_REVISIONS_NOTE;
  const hours = quotation.working_hours || DEFAULT_WORKING_HOURS;
  const deliveryPeriod = quotation.delivery_period || "-";
  const imageSamples = samples.filter((s) => s.kind === "image");
  const linkSamples = samples.filter((s) => s.kind === "link");

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto p-5 sm:p-12 print:p-4 shadow-[0_30px_80px_rgba(15,40,90,0.10)] print:shadow-none rounded-2xl print:rounded-none print:max-w-none print:w-full">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between pb-6 sm:pb-8 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <img src="/navbar/CDS Logo.svg" alt="CDS Space" width={56} height={56} className="w-12 h-12 sm:w-16 sm:h-16" />
          <div>
            <div className="text-lg sm:text-xl font-bold tracking-tight">CDS Space</div>
            <div className="text-xs text-gray-500">Branding & Digital Agency</div>
          </div>
        </div>
        <div className="flex items-center justify-between sm:block sm:text-right">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400">Quotation</div>
            <div className="text-lg sm:text-2xl font-bold break-all">{quotation.quotation_number}</div>
          </div>
          <div className="sm:mt-2 text-xs">
            <span className={`inline-block px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${STATUS[quotation.status] ?? STATUS.draft}`}>
              {quotation.status}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">Rough project estimate:</span> {estimateNote}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-8 py-6 sm:py-8">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Project / Company</div>
          <div className="font-semibold text-gray-900">{quotation.project_name}</div>
          <div className="mt-5 text-[10px] uppercase tracking-wider text-gray-400 mb-2">Prepared For</div>
          <div className="font-semibold text-gray-900">{quotation.client_name}</div>
          {quotation.client_email && <div className="text-sm text-gray-600 break-words">{quotation.client_email}</div>}
          {quotation.client_address && <div className="text-sm text-gray-600 whitespace-pre-line">{quotation.client_address}</div>}
        </div>
        <div className="sm:text-right">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Issued / Validity</div>
          <div className="text-sm">{formatFinanceDate(quotation.issue_date)}</div>
          {quotation.valid_until && <div className="text-sm text-gray-600">Valid until {formatFinanceDate(quotation.valid_until)}</div>}
          <div className="mt-5 text-[10px] uppercase tracking-wider text-gray-400 mb-2">Delivery Period</div>
          <div className="text-sm font-semibold text-gray-900">{deliveryPeriod}</div>
        </div>
      </div>

      <div className="hidden sm:block">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400">
              <th className="text-left py-3 px-3 font-semibold border-b border-gray-100 rounded-tl-lg bg-gray-50/60">Item</th>
              <th className="text-right py-3 px-3 font-semibold w-20 border-b border-gray-100 bg-gray-50/60">Qty</th>
              <th className="text-right py-3 px-3 font-semibold w-32 border-b border-gray-100 bg-gray-50/60">Unit Price</th>
              <th className="text-right py-3 px-3 font-semibold w-32 border-b border-gray-100 rounded-tr-lg bg-gray-50/60">Estimate</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-blue-50/30"}>
                <td className="py-4 px-3 border-b border-gray-50">
                  <div className="font-medium text-gray-900">{it.name}</div>
                  {it.description && <div className="text-xs text-gray-500 mt-0.5">{it.description}</div>}
                </td>
                <td className="text-right py-4 px-3 text-sm border-b border-gray-50">{it.quantity}</td>
                <td className="text-right py-4 px-3 text-sm border-b border-gray-50">{formatMoney(it.unit_price, quotation.currency)}</td>
                <td className="text-right py-4 px-3 text-sm font-medium border-b border-gray-50">{formatMoney(it.total, quotation.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="sm:hidden space-y-3">
        {items.map((it, i) => (
          <li key={i} className="rounded-xl border border-gray-100 bg-gray-50/40 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900 text-[15px] leading-snug">{it.name}</div>
                {it.description && <div className="text-xs text-gray-500 mt-1 leading-relaxed">{it.description}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[15px] font-bold text-gray-900 whitespace-nowrap">{formatMoney(it.total, quotation.currency)}</div>
              </div>
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-gray-200/70 flex items-center justify-between text-xs text-gray-500">
              <span>Qty <span className="text-gray-800 font-medium">{it.quantity}</span></span>
              <span>Unit <span className="text-gray-800 font-medium">{formatMoney(it.unit_price, quotation.currency)}</span></span>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-6 sm:gap-8">
        <div className="shrink-0 hidden sm:block">
          <img
            src="/CDS_Seal.png"
            alt="CDS Space seal"
            width={108}
            height={108}
            className="w-[108px] h-[108px] object-contain opacity-90 select-none"
          />
        </div>
        <div className="w-full sm:w-72 space-y-2 text-sm">
          <div className="flex justify-between gap-4 text-gray-600"><span>Subtotal</span><span className="whitespace-nowrap">{formatMoney(quotation.subtotal, quotation.currency)}</span></div>
          {Number(quotation.discount) > 0 && (
            <div className="flex justify-between gap-4 text-blue-600"><span>Discount</span><span className="whitespace-nowrap">- {formatMoney(quotation.discount, quotation.currency)}</span></div>
          )}
          {Number(quotation.tax_rate) > 0 && (
            <div className="flex justify-between gap-4 text-gray-600"><span>Tax ({quotation.tax_rate}%)</span><span className="whitespace-nowrap">{formatMoney(quotation.tax_amount, quotation.currency)}</span></div>
          )}
          <div className="flex justify-between gap-4 pt-3 border-t border-gray-200 text-lg font-bold">
            <span>Estimated Total</span><span className="whitespace-nowrap">{formatMoney(quotation.total, quotation.currency)}</span>
          </div>
        </div>
      </div>

      {quotation.notes && (
        <div className="mt-10 p-4 rounded-xl bg-blue-50 border border-blue-100">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Notes</div>
          <div className="text-sm text-gray-700 whitespace-pre-line">{quotation.notes}</div>
        </div>
      )}

      {samples.length > 0 && (
        <section className="mt-10 rounded-2xl border border-gray-100 bg-gray-50/70 p-5 print:break-inside-avoid">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">Sample References</div>
          {imageSamples.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imageSamples.map((sample, i) => (
                <a key={`${sample.url}-${i}`} href={sample.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-white bg-white">
                  <img src={sample.url} alt={sample.label || "Sample reference"} className="aspect-[4/3] w-full object-cover bg-gray-100" />
                  <div className="px-2.5 py-2 text-[11px] text-gray-600 truncate">{sample.label || safeHost(sample.url)}</div>
                </a>
              ))}
            </div>
          )}
          {linkSamples.length > 0 && (
            <div className={imageSamples.length > 0 ? "mt-4 space-y-2" : "space-y-2"}>
              {linkSamples.map((sample, i) => (
                <a key={`${sample.url}-${i}`} href={sample.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm text-blue-700 border border-white hover:border-blue-100">
                  <span className="truncate">{sample.label || safeHost(sample.url)}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{safeHost(sample.url)}</span>
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      <section
        className="mt-10 rounded-2xl overflow-hidden bg-[#06103A] text-white print:break-inside-avoid"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as CSSProperties}
      >
        <div className="px-6 py-5">
          <span className="inline-block px-3 py-1 rounded-lg bg-[#0A4FE8] text-white text-[12px] font-semibold" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as CSSProperties}>
            Estimate Details
          </span>
          <div className="mt-5 space-y-1.5 text-[13px] leading-relaxed text-white/90 print:text-white/90">
            <p><span className="text-white/70 print:text-white/70">Delivery Period:</span> <span className="font-bold">{deliveryPeriod}</span></p>
            <p><span className="text-white/70 print:text-white/70">No. of Revisions:</span> <span className="font-bold">{revisions}</span></p>
            <p><span className="text-white/70 print:text-white/70">Working Hours:</span> <span className="font-bold">{hours}</span></p>
            <p><span className="text-white/70 print:text-white/70">Accounting:</span> <span className="font-bold">Not recorded in financial books until converted to invoice.</span></p>
          </div>
        </div>
      </section>

      <div className="mt-8 text-[10px] uppercase tracking-wider text-gray-400">
        CDS Space rough quotation
      </div>

      <div className="mt-6 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
        Truly Best attracts Best - CDS Space
      </div>
    </div>
  );
}
