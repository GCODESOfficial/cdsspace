'use client';

import {
  Currency, formatFinanceDate, formatMoney,
  CDS_BANK_ACCOUNTS,
  DEFAULT_PAYMENT_TERMS, DEFAULT_REVISIONS_NOTE, DEFAULT_WORKING_HOURS,
  deliverySpeedLabel, type DeliverySpeed,
  type FinanceBankAccount,
  type FinanceReceipt,
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

export default function InvoiceDocument({ invoice, items, bankAccounts, receipt }: { invoice: Invoice; items: Item[]; bankAccounts?: FinanceBankAccount[]; receipt?: FinanceReceipt }) {
  const terms = invoice.payment_terms || DEFAULT_PAYMENT_TERMS;
  const revisions = invoice.revisions_note || DEFAULT_REVISIONS_NOTE;
  const hours = invoice.working_hours || DEFAULT_WORKING_HOURS;
  const deliverySpeed = deliverySpeedLabel(invoice.delivery_speed || "standard");
  const deliveryPeriod = invoice.delivery_period || "-";
  const paymentAccounts: FinanceBankAccount[] = bankAccounts ?? (invoice.currency === "NGN" ? CDS_BANK_ACCOUNTS.map((account) => ({
    currency: "NGN" as const,
    bank_name: account.bank,
    account_name: account.account_name,
    account_number: account.account_number,
    logo_url: account.logo,
  })) : []);
  const isReceipt = Boolean(receipt);
  const paymentMethod = receipt?.payment_method === "bank_transfer" ? "Bank transfer" : receipt?.payment_method === "paystack" ? "Paystack" : receipt?.payment_method || "Confirmed payment";

  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto p-5 sm:p-12 print:p-4 shadow-[0_30px_80px_rgba(15,40,90,0.10)] print:shadow-none rounded-2xl print:rounded-none print:max-w-none print:w-full">
      {/* Header */}
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
            <div className="text-[11px] uppercase tracking-wider text-gray-400">{isReceipt ? "Receipt" : "Invoice"}</div>
            <div className="text-lg sm:text-2xl font-bold break-all">{receipt?.receipt_number || invoice.invoice_number}</div>
          </div>
          <div className="sm:mt-2 text-xs">
            <span className={`inline-block px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${
              invoice.status === "paid" ? "bg-emerald-50 text-emerald-700" :
              invoice.status === "sent" ? "bg-blue-50 text-blue-700" :
              invoice.status === "overdue" ? "bg-red-50 text-red-700" :
              "bg-gray-100 text-gray-600"
            }`}>{isReceipt ? "paid" : invoice.status}</span>
          </div>
        </div>
      </div>

      {/* Bill to / dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-8 py-6 sm:py-8">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">{isReceipt ? "Received from" : "Billed To"}</div>
          <div className="font-semibold text-gray-900">{invoice.client_name}</div>
          {invoice.client_email && <div className="text-sm text-gray-600 break-words">{invoice.client_email}</div>}
          {invoice.client_address && <div className="text-sm text-gray-600 whitespace-pre-line">{invoice.client_address}</div>}
        </div>
        <div className="sm:text-right">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">{isReceipt ? "Paid / issued" : "Issued / Due"}</div>
          <div className="text-sm">{isReceipt ? formatFinanceDate(receipt?.paid_at, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : formatFinanceDate(invoice.issue_date)}</div>
          {isReceipt ? <div className="text-sm text-gray-600">Invoice issued {formatFinanceDate(invoice.issue_date)}</div> : invoice.due_date && <div className="text-sm text-gray-600">Due {formatFinanceDate(invoice.due_date)}</div>}
        </div>
      </div>

      {/* Items - table on desktop, card list on mobile */}
      <div className="hidden sm:block">
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
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-blue-50/30"}>
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
      </div>

      {/* Mobile item cards */}
      <ul className="sm:hidden space-y-3">
        {items.map((it, i) => (
          <li key={i} className="rounded-xl border border-gray-100 bg-gray-50/40 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900 text-[15px] leading-snug">{it.name}</div>
                {it.description && <div className="text-xs text-gray-500 mt-1 leading-relaxed">{it.description}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[15px] font-bold text-gray-900 whitespace-nowrap">{formatMoney(it.total, invoice.currency)}</div>
              </div>
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-gray-200/70 flex items-center justify-between text-xs text-gray-500">
              <span>Qty <span className="text-gray-800 font-medium">{it.quantity}</span></span>
              <span>Unit <span className="text-gray-800 font-medium">{formatMoney(it.unit_price, invoice.currency)}</span></span>
            </div>
          </li>
        ))}
      </ul>

      {/* Totals + seal */}
      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-6 sm:gap-8">
        <div className="shrink-0 hidden sm:block">
          <img
            src="/CDS_Seal.png"
            alt="CDS Space official seal"
            width={108}
            height={108}
            className="w-[108px] h-[108px] object-contain opacity-90 select-none"
          />
        </div>
        <div className="w-full sm:w-72 space-y-2 text-sm">
          <div className="flex justify-between gap-4 text-gray-600"><span>Subtotal</span><span className="whitespace-nowrap">{formatMoney(invoice.subtotal, invoice.currency)}</span></div>
          {Number(invoice.discount) > 0 && (
            <div className="flex justify-between gap-4 text-blue-600"><span>Discount</span><span className="whitespace-nowrap">− {formatMoney(invoice.discount, invoice.currency)}</span></div>
          )}
          {Number(invoice.tax_rate) > 0 && (
            <div className="flex justify-between gap-4 text-gray-600"><span>Tax ({invoice.tax_rate}%)</span><span className="whitespace-nowrap">{formatMoney(invoice.tax_amount, invoice.currency)}</span></div>
          )}
          <div className="flex justify-between gap-4 pt-3 border-t border-gray-200 text-lg font-bold">
            <span>Total</span><span className="whitespace-nowrap">{formatMoney(invoice.total, invoice.currency)}</span>
          </div>
        </div>
      </div>

      {!isReceipt && invoice.notes && (
        <div className="mt-10 p-4 rounded-xl bg-blue-50 border border-blue-100">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Notes</div>
          <div className="text-sm text-gray-700 whitespace-pre-line">{invoice.notes}</div>
        </div>
      )}

      {/* Payment Details - invoice instructions or confirmed receipt transaction */}
      <section 
        className="mt-10 rounded-2xl overflow-hidden bg-[#06103A] text-white print:break-inside-avoid"
        style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}
      >
        <div className="px-6 py-5">
          <span className="inline-block px-3 py-1 rounded-lg bg-[#0A4FE8] text-white text-[12px] font-semibold" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}>
            {isReceipt ? "Payment confirmation" : "Payment Details"}
          </span>

          {isReceipt ? (
            <div className="mt-5 grid grid-cols-1 gap-3 text-[12px] md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-white/55">Amount received</p><p className="mt-1 text-[20px] font-bold text-white">{formatMoney(receipt?.amount, receipt?.currency)}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-white/55">Invoice paid</p><p className="mt-1 font-bold text-white">{invoice.invoice_number}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-white/55">Payment method</p><p className="mt-1 font-bold text-white">{paymentMethod}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-white/55">Payment reference</p><p className="mt-1 break-all font-mono font-bold text-white">{receipt?.payment_reference || "Confirmed by CDS Space Finance"}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:col-span-2"><p className="text-white/55">Confirmed at</p><p className="mt-1 font-bold text-white">{formatFinanceDate(receipt?.paid_at, { weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}</p></div>
            </div>
          ) : <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {paymentAccounts.length ? paymentAccounts.map((b) => (
              <div key={b.id || `${b.currency}-${b.bank_name}-${b.account_number || b.iban}`} className="flex items-start gap-3">
                {b.logo_url ? (
                  <div className="shrink-0 w-14 h-14 rounded-xl bg-white border border-white/20 p-2 flex items-center justify-center overflow-hidden" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}>
                    <img src={b.logo_url} alt={b.bank_name} width={48} height={48} className="object-contain" />
                  </div>
                ) : (
                  <div
                    className="shrink-0 w-14 h-14 rounded-md flex items-center justify-center text-white text-[26px] font-extrabold italic"
                    style={{ background: "#0A4FE8", WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}
                    aria-hidden
                  >
                    {b.bank_name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[13px] text-white/80 print:text-white/80">{b.bank_name} · {b.currency}</div>
                  {b.account_number && <div className="font-mono text-[22px] md:text-[26px] font-bold leading-tight tracking-wide text-white print:text-white">{b.account_number}</div>}
                  {b.iban && <div className="break-all font-mono text-[13px] font-bold leading-tight tracking-wide text-white print:text-white">IBAN {b.iban}</div>}
                  <div className="text-[12px] text-white/80 print:text-white/80">{b.account_name}</div>
                  {b.swift_bic && <div className="mt-1 text-[10px] text-white/65">SWIFT/BIC {b.swift_bic}</div>}
                  {b.routing_number && <div className="text-[10px] text-white/65">Routing {b.routing_number}</div>}
                </div>
              </div>
            )) : <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-[12px] leading-5 text-white/75">No corporate bank account is listed for {invoice.currency}. Use the secure Paystack option on the invoice payment screen.</div>}
          </div>}
        </div>

        {!isReceipt && <div className="border-t border-white/10 px-6 py-5 space-y-1.5 text-[13px] leading-relaxed text-white/90 print:text-white/90">
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
        </div>}
      </section>

      <div className="mt-8 text-[10px] uppercase tracking-wider text-gray-400">
        Official CDS Space {isReceipt ? "receipt" : "invoice"}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
        Truly Best attracts Best - CDS Space
      </div>
    </div>
  );
}
