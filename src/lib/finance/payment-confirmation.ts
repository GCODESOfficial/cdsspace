import "server-only";

import { formatMoney } from "@/lib/finance/types";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://cdsspace.pro").replace(/\/$/, "");

export async function deliverInvoicePaymentConfirmation(db: any, invoiceId: string) {
  const { data: invoice } = await db
    .from("finance_invoices")
    .select("id, invoice_number, user_id, client_name, total, currency, public_token, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice?.user_id || invoice.status !== "paid") return { sent: false, reason: "invoice_not_ready" };

  const { data: receipt } = await db
    .from("finance_receipts")
    .select("id, receipt_number, public_token")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (!receipt?.public_token) return { sent: false, reason: "receipt_not_ready" };

  const invoiceUrl = `${SITE_URL}/invoice/${invoice.public_token}`;
  const receiptUrl = `${SITE_URL}/receipt/${receipt.public_token}`;
  const message = [
    `Payment confirmed for Invoice ${invoice.invoice_number}.`,
    `Amount: ${formatMoney(invoice.total, invoice.currency)}`,
    `Invoice: ${invoiceUrl}`,
    `Receipt ${receipt.receipt_number}: ${receiptUrl}`,
  ].join("\n\n");

  const { error } = await db.from("chat_messages").insert({
    room_id: `client_${invoice.user_id}`,
    sender_id: null,
    sender_role: "admin",
    message,
    source: "web",
    message_type: "text",
    delivery_status: "sent",
    sent_at: new Date().toISOString(),
    metadata: {
      kind: "invoice_payment_confirmed",
      automated: true,
      invoice_id: invoice.id,
      receipt_id: receipt.id,
      invoice_number: invoice.invoice_number,
    },
  });
  if (error && /duplicate|unique/i.test(error.message || "")) {
    return { sent: false, reason: "already_delivered", receipt };
  }
  if (error) throw error;

  await db.from("notifications").insert({
    user_id: invoice.user_id,
    type: "status_change",
    title: "Payment verified",
    message: `${invoice.invoice_number} is paid. Your receipt is ready.`,
    link: `/invoice/${invoice.public_token}#payment`,
  });
  return { sent: true, receipt };
}
