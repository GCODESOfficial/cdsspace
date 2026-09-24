import "server-only";

import { glashQuery } from "@/lib/glashdb/postgres";

/**
 * Cancels invoices that passed their validity date unpaid.
 *
 * Only invoices raised after the 28 day rule existed carry an expiry date, so
 * older invoices are never touched. An invoice with any payment against it is
 * left alone and reported instead: part-payment is a live arrangement, and
 * cancelling it would erase money the client has already sent.
 */
export async function cancelExpiredInvoices(options: { dryRun?: boolean } = {}) {
  const due = await glashQuery<{ id: string; invoice_number: string; client_name: string; total: string; amount_paid: string | null }>(
    `select id::text, invoice_number, client_name, total::text, amount_paid::text
       from public.finance_invoices
      where auto_cancel_at is not null
        and auto_cancel_at <= now()
        and deleted_at is null
        and status in ('draft', 'sent')`,
  );

  const unpaid = due.filter((invoice) => Number(invoice.amount_paid || 0) <= 0);
  const partlyPaid = due.filter((invoice) => Number(invoice.amount_paid || 0) > 0);

  if (options.dryRun || unpaid.length === 0) {
    return {
      expired: unpaid.length,
      cancelled: 0,
      skippedPartlyPaid: partlyPaid.map((invoice) => invoice.invoice_number),
      dryRun: Boolean(options.dryRun),
    };
  }

  const cancelled = await glashQuery<{ invoice_number: string }>(
    // Zeroing the balance is what a cancelled invoice looks like everywhere
    // else in finance. Without it these would keep counting as money owed.
    `update public.finance_invoices
        set status = 'cancelled', balance_due = 0
      where id = any($1::uuid[])
        and status in ('draft', 'sent')
      returning invoice_number`,
    [unpaid.map((invoice) => invoice.id)],
  );

  return {
    expired: unpaid.length,
    cancelled: cancelled.length,
    cancelledNumbers: cancelled.map((row) => row.invoice_number),
    skippedPartlyPaid: partlyPaid.map((invoice) => invoice.invoice_number),
    dryRun: false,
  };
}
