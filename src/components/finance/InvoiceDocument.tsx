'use client';

import Image from "next/image";
import { Currency, formatMoney } from "@/lib/finance/types";

interface Item { name: string; description: string | null; quantity: number; unit_price: number; total: number; }
interface Invoice {
  invoice_number: string;
  client_name: string; client_email: string | null; client_address: string | null;
  currency: Currency;
  subtotal: number; tax_rate: number; tax_amount: number; discount: number; total: number;
  status: string; issue_date: string; due_date: string | null; notes: string | null;
}

export default function InvoiceDocument({ invoice, items }: { invoice: Invoice; items: Item[] }) {
  return (
    <div className="bg-white text-gray-900 max-w-[820px] mx-auto p-12 print:p-8 shadow-[0_30px_80px_rgba(15,40,90,0.10)] print:shadow-none rounded-2xl print:rounded-none">
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

      {/* Items table */}
      <table className="w-full">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <th className="text-left py-3 font-semibold">Item</th>
            <th className="text-right py-3 font-semibold w-20">Qty</th>
            <th className="text-right py-3 font-semibold w-32">Unit Price</th>
            <th className="text-right py-3 font-semibold w-32">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-gray-50">
              <td className="py-4">
                <div className="font-medium text-gray-900">{it.name}</div>
                {it.description && <div className="text-xs text-gray-500 mt-0.5">{it.description}</div>}
              </td>
              <td className="text-right py-4 text-sm">{it.quantity}</td>
              <td className="text-right py-4 text-sm">{formatMoney(it.unit_price, invoice.currency)}</td>
              <td className="text-right py-4 text-sm font-medium">{formatMoney(it.total, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mt-6">
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

      <div className="mt-12 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
        Truly Best attracts Best — CDS Space
      </div>
    </div>
  );
}
