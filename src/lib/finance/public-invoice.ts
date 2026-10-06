import "server-only";

import { financeDb } from "@/lib/finance/api-auth";
import { getPaystackStatus } from "@/lib/paystack";

/**
 * Public invoice lookup, shared by GET /api/finance/invoice/[token] (the invoice
 * page and the app's invoice screen) and its /pdf download. Accepts EITHER the
 * shareable `public_token` OR the human-readable `invoice_number` (e.g.
 * INV-202604-7227) so pasted links work either way. Only the invoice itself is
 * exposed - no admin fields. Returns null when there is no such invoice.
 */
export async function loadPublicInvoice(token: string) {
  const sb = financeDb();

  let { data: invoice } = await sb
    .from("finance_invoices")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();

  if (!invoice) {
    const { data: byNumber } = await sb
      .from("finance_invoices")
      .select("*")
      .ilike("invoice_number", token)
      .maybeSingle();
    invoice = byNumber;
  }

  if (!invoice) return null;

  const { data: items } = await sb
    .from("finance_invoice_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("position");
  const safeInvoice = { ...invoice };
  delete safeInvoice.user_id;
  delete safeInvoice.marketer_user_id;
  const [{ data: paymentSubmission }, { data: receipt }, { data: bankAccounts }] = await Promise.all([
    sb.from("invoice_payment_submissions")
      .select("id, method, status, amount, currency, payer_name, payer_email, transfer_reference, proof_file_name, proof_mime_type, proof_size_bytes, submitted_at, reviewed_at, admin_note")
      .eq("invoice_id", invoice.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("finance_receipts")
      .select("id, receipt_number, invoice_id, public_token, client_name, client_email, amount, currency, payment_method, payment_reference, paid_at, emailed_at, created_at")
      .eq("invoice_id", invoice.id)
      .maybeSingle(),
    sb.from("sales_bank_accounts")
      .select("id, currency, country_code, bank_name, account_name, account_number, iban, swift_bic, routing_number, bank_address, instructions, logo_url, active, sort_order")
      .eq("currency", invoice.currency)
      .eq("active", true)
      .order("sort_order")
      .order("bank_name"),
  ]);
  return {
    invoice: safeInvoice,
    items: items ?? [],
    paymentSubmission: paymentSubmission ?? null,
    receipt: receipt ? { ...receipt, invoice_number: invoice.invoice_number } : null,
    bankAccounts: bankAccounts ?? [],
    paymentOptions: { paystack: getPaystackStatus().configured, bankTransfer: (bankAccounts?.length || 0) > 0 },
  };
}
