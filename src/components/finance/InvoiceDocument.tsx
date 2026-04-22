'use client';

import Image from "next/image";
import {
  Currency, formatMoney,
  CDS_BANK_ACCOUNTS,
  DEFAULT_PAYMENT_TERMS, DEFAULT_REVISIONS_NOTE, DEFAULT_WORKING_HOURS,
  deliverySpeedLabel, type DeliverySpeed,
} from "@/lib/finance/types";

interface Item { name: string; description: string | null; quantity: number; unit_price: number; total: number; }
interface Invoice {
  invoice_number: string;
  client_name: string; client_email: string | null; client_address: string | null;
  currency: Currency;
  subtotal: number; tax_rate: number; tax_amount: number; discount: number; total: number;
  status: string; issue_date: string; due_date: string | null; notes: string | null;
  payment_terms?: string | null;
  revisions_note?: string | null;
  working_hours?: string | null;
  delivery_speed?: DeliverySpeed | null;
  delivery_period?: string | null;
}

export default function InvoiceDocument({ invoice, items }: { invoice: Invoice; items: Item[] }) {
  const terms = invoice.payment_terms || DEFAULT_PAYMENT_TERMS;
  const revisions = invoice.revisions_note || DEFAULT_REVISIONS_NOTE;
  const hours = invoice.working_hours || DEFAULT_WORKING_HOURS;
  const deliverySpeed = deliverySpeedLabel(invoice.delivery_speed || "standard");
  const deliveryPeriod = invoice.delivery_period || "—";

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto p-12 print:p-4 shadow-[0_30px_80px_rgba(15,40,90,0.10)] print:shadow-none rounded-2xl print:rounded-none print:max-w-none print:w-full">
      {/* Header */}
      <div className="flex items-start justify-between pb-8 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={64} height={64} />
          <div>
            <div className="text-xl font-bold tracking-tight">CDS Space</div>
            <div className="text-xs text-gray-500">Branding & Digital Agency</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-gray-400">Invoice</div>
          <div className="text-2xl font-bold">{invoice.invoice_number}</div>
          <div className="mt-2 text-xs">
            <span className={`inline-block px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${
              invoice.status === "paid" ? "bg-emerald-50 text-emerald-700" :
              invoice.status === "sent" ? "bg-blue-50 text-blue-700" :
              invoice.status === "overdue" ? "bg-red-50 text-red-700" :
              "bg-gray-100 text-gray-600"
            }`}>{invoice.status}</span>
          </div>
        </div>
      </div>

      {/* Bill to / dates */}
      <div className="grid grid-cols-2 gap-8 py-8">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Billed To</div>
          <div className="font-semibold text-gray-900">{invoice.client_name}</div>
          {invoice.client_email && <div className="text-sm text-gray-600">{invoice.client_email}</div>}
          {invoice.client_address && <div className="text-sm text-gray-600 whitespace-pre-line">{invoice.client_address}</div>}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Issued / Due</div>
          <div className="text-sm">{new Date(invoice.issue_date).toLocaleDateString()}</div>
          {invoice.due_date && <div className="text-sm text-gray-600">Due {new Date(invoice.due_date).toLocaleDateString()}</div>}
        </div>
      </div>

      {/* Items table — zebra rows for readability */}
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-gray-400">
            <th className="text-left py-3 px-3 font-semibold border-b border-gray-100 rounded-tl-lg bg-gray-50/60">Item</th>
            <th className="text-right py-3 px-3 font-semibold w-20 border-b border-gray-100 bg-gray-50/60">Qty</th>
            <th className="text-right py-3 px-3 font-semibold w-32 border-b border-gray-100 bg-gray-50/60">Unit Price</th>
            <th className="text-right py-3 px-3 font-semibold w-32 border-b border-gray-100 rounded-tr-lg bg-gray-50/60">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr
              key={i}
              className={i % 2 === 0 ? "bg-white" : "bg-blue-50/30"}
            >
              <td className="py-4 px-3 border-b border-gray-50">
                <div className="font-medium text-gray-900">{it.name}</div>
                {it.description && <div className="text-xs text-gray-500 mt-0.5">{it.description}</div>}
              </td>
              <td className="text-right py-4 px-3 text-sm border-b border-gray-50">{it.quantity}</td>
              <td className="text-right py-4 px-3 text-sm border-b border-gray-50">{formatMoney(it.unit_price, invoice.currency)}</td>
              <td className="text-right py-4 px-3 text-sm font-medium border-b border-gray-50">{formatMoney(it.total, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals + seal */}
      <div className="mt-6 flex items-end justify-between gap-8">
        <div className="shrink-0">
          <Image
            src="/CDS_Seal.png"
            alt="CDS Space official seal"
            width={108}
            height={108}
            className="w-[108px] h-[108px] object-contain opacity-90 select-none"
            priority={false}
          />
        </div>
        <div className="w-72 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatMoney(invoice.subtotal, invoice.currency)}</span></div>
          {Number(invoice.discount) > 0 && (
            <div className="flex justify-between text-blue-600"><span>Discount</span><span>− {formatMoney(invoice.discount, invoice.currency)}</span></div>
          )}
          {Number(invoice.tax_rate) > 0 && (
            <div className="flex justify-between text-gray-600"><span>Tax ({invoice.tax_rate}%)</span><span>{formatMoney(invoice.tax_amount, invoice.currency)}</span></div>
          )}
          <div className="flex justify-between pt-3 border-t border-gray-200 text-lg font-bold">
            <span>Total</span><span>{formatMoney(invoice.total, invoice.currency)}</span>
          </div>
        </div>
      </div>

      {invoice.notes && (
        <div className="mt-10 p-4 rounded-xl bg-blue-50 border border-blue-100">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Notes</div>
          <div className="text-sm text-gray-700 whitespace-pre-line">{invoice.notes}</div>
        </div>
      )}

      {/* Payment Details — brand panel */}
      <section 
        className="mt-10 rounded-2xl overflow-hidden bg-[#06103A] text-white print:break-inside-avoid"
        style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}
      >
        <div className="px-6 py-5">
          <span className="inline-block px-3 py-1 rounded-lg bg-[#0A4FE8] text-white text-[12px] font-semibold" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}>
            Payment Details
          </span>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {CDS_BANK_ACCOUNTS.map((b) => (
              <div key={b.bank} className="flex items-start gap-3">
                {b.logo ? (
                  <div className="shrink-0 w-14 h-14 rounded-xl bg-white border border-white/20 p-2 flex items-center justify-center overflow-hidden" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}>
                    <Image src={b.logo} alt={b.bank} width={48} height={48} className="object-contain" />
                  </div>
                ) : (
                  <div
                    className="shrink-0 w-14 h-14 rounded-md flex items-center justify-center text-white text-[26px] font-extrabold italic"
                    style={{ background: b.color, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}
                    aria-hidden
                  >
                    {b.initial}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[13px] text-white/80 print:text-white/80">{b.bank}</div>
                  <div className="font-mono text-[22px] md:text-[26px] font-bold leading-tight tracking-wide text-white print:text-white">
                    {b.account_number}
                  </div>
                  <div className="text-[12px] text-white/80 print:text-white/80">{b.account_name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 px-6 py-5 space-y-1.5 text-[13px] leading-relaxed text-white/90 print:text-white/90">
          <p><span className="text-white/70 print:text-white/70">Payment Terms:</span> <span className="font-bold">{terms}</span></p>
          <p><span className="text-white/70 print:text-white/70">No. of Revisions:</span> <span className="font-bold">{revisions}</span></p>
          <p>
            <span className="text-white/70 print:text-white/70">Delivery:</span>{" "}
            <span className="font-bold">{deliverySpeed}</span>
            <span className="mx-1.5 text-white/40">·</span>
            <span className="text-white/70 print:text-white/70">Period:</span>{" "}
            <span className="font-bold">{deliveryPeriod}</span>
          </p>
          <p><span className="text-white/70 print:text-white/70">Working Hours:</span> <span className="font-bold">{hours}</span></p>
        </div>
      </section>

      <div className="mt-8 text-[10px] uppercase tracking-wider text-gray-400">
        Official CDS Space invoice
      </div>

      <div className="mt-6 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
        Truly Best attracts Best — CDS Space
      </div>
    </div>
  );
}
