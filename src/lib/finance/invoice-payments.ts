import "server-only";

import { glashOne } from "@/lib/glashdb/postgres";

export async function recordInvoicePayment(input: {
  invoiceId: string;
  amount: number;
  currency: string;
  paidOn?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  sourceType: string;
  sourceId?: string | null;
  bankTransactionId?: string | null;
  notes?: string | null;
  recordedBy?: string | null;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  const payment = await glashOne<Record<string, unknown>>(
    `select * from public.record_finance_invoice_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.invoiceId,
      Math.round(input.amount * 100) / 100,
      input.currency.toUpperCase(),
      input.paidOn || new Date().toISOString().slice(0, 10),
      input.paymentMethod || "bank_transfer",
      input.paymentReference || null,
      input.sourceType,
      input.sourceId || null,
      input.bankTransactionId || null,
      input.notes || null,
      input.recordedBy || null,
    ],
  );
  const invoice = await glashOne<Record<string, unknown>>(
    "select * from public.finance_invoices where id = $1",
    [input.invoiceId],
  );
  return { payment, invoice };
}
