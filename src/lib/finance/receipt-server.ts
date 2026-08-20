import "server-only";

import { brandedEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-from";
import { formatMoney } from "@/lib/finance/types";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function emailInvoiceReceipt(db: any, invoiceId: string) {
  const { data: invoice } = await db
    .from("finance_invoices")
    .select("id, invoice_number, client_name, client_email, total, currency, public_token")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice?.client_email) return { sent: false, reason: "missing_email" };

  const { data: receipt } = await db
    .from("finance_receipts")
    .select("*")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (!receipt) return { sent: false, reason: "missing_receipt" };
  if (receipt.emailed_at) return { sent: false, reason: "already_sent", receipt };

  const receiptUrl = `${SITE_URL}/receipt/${receipt.public_token}`;
  const invoiceUrl = `${SITE_URL}/invoice/${invoice.public_token}`;
  const html = brandedEmailHtml(
    `
      <h2 style="margin:0 0 12px;color:#0D1B39;">Your payment receipt is ready</h2>
      <p>Hi ${escapeHtml(invoice.client_name || "there")},</p>
      <p>We have confirmed your payment of <strong>${escapeHtml(formatMoney(invoice.total, invoice.currency))}</strong> for Invoice <strong>${escapeHtml(invoice.invoice_number)}</strong>.</p>
      <p>Your invoice is now marked paid. If it is linked to a production order, work can now move into the active queue.</p>
      <p style="text-align:center;margin:26px 0;">
        <a href="${receiptUrl}" style="display:inline-block;background:linear-gradient(146deg,#0035C1,#0575FF);color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;margin:4px;">View and download receipt</a>
        <a href="${invoiceUrl}" style="display:inline-block;border:1px solid #cbd5e1;color:#0D1B39;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:700;margin:4px;">View paid invoice</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">Receipt ${escapeHtml(receipt.receipt_number)} is available at the secure link above for your records.</p>
    `,
    { eyebrow: "Payment Confirmed", preheader: `Receipt for Invoice ${invoice.invoice_number}` },
  );

  await sendEmail({
    to: invoice.client_email,
    subject: `Payment receipt - ${invoice.invoice_number}`,
    html,
  });
  const emailedAt = new Date().toISOString();
  await db.from("finance_receipts").update({ emailed_at: emailedAt }).eq("id", receipt.id);
  return { sent: true, receipt: { ...receipt, emailed_at: emailedAt } };
}
