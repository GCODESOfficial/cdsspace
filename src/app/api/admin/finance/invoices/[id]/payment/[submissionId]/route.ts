import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { emailInvoiceReceipt } from "@/lib/finance/receipt-server";
import { logActivity } from "@/lib/activity-log";
import { deliverInvoicePaymentConfirmation } from "@/lib/finance/payment-confirmation";
import { recordInvoicePayment } from "@/lib/finance/invoice-payments";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const denied = await requireFinanceAdminAsync(request, "finance_invoices.mark_paid");
  if (denied) return denied;
  const session = await getAdminSessionAsync(request);
  const { id, submissionId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action === "reject" ? "reject" : "confirm";
  const note = String(body.note || "").trim().slice(0, 1000) || null;
  const db = financeDb();

  const { data: submission } = await db
    .from("invoice_payment_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("invoice_id", id)
    .maybeSingle();
  if (!submission) return NextResponse.json({ error: "Payment submission not found." }, { status: 404 });
  if (submission.status !== "pending") return NextResponse.json({ error: "This submission has already been reviewed." }, { status: 409 });
  if (action === "confirm" && submission.method === "paystack") {
    return NextResponse.json({ error: "Paystack payments are confirmed automatically after provider verification." }, { status: 409 });
  }

  const reviewer = session?.name || session?.email || "Finance admin";
  if (action === "reject") {
    const { data, error } = await db.from("invoice_payment_submissions").update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewer, admin_note: note, updated_at: new Date().toISOString() }).eq("id", submissionId).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logActivity({ action: "invoice.payment_rejected", page: "finance/invoices", resource_type: "invoice", resource_id: id, metadata: { submission_id: submissionId, note } });
    return NextResponse.json({ submission: data });
  }

  let paymentResult;
  try {
    paymentResult = await recordInvoicePayment({
      invoiceId: id,
      amount: Number(submission.amount),
      currency: submission.currency,
      paidOn: new Date().toISOString().slice(0, 10),
      paymentMethod: submission.method,
      paymentReference: submission.transfer_reference,
      sourceType: "payment_submission",
      sourceId: submission.id,
      notes: note,
      recordedBy: reviewer,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment could not be recorded." }, { status: 400 });
  }
  const invoice = paymentResult.invoice;
  await db.from("invoice_payment_submissions").update({ status: "confirmed", reviewed_at: new Date().toISOString(), reviewed_by: reviewer, admin_note: note, updated_at: new Date().toISOString() }).eq("id", submissionId);
  if (invoice.status === "paid") {
    await emailInvoiceReceipt(db, id).catch(() => null);
    await deliverInvoicePaymentConfirmation(db, id).catch(() => null);
  }
  const { data: receipt } = await db.from("finance_receipts").select("*").eq("invoice_id", id).maybeSingle();
  await logActivity({ action: invoice.status === "paid" ? "invoice.payment_confirmed" : "invoice.part_payment_confirmed", page: "finance/invoices", resource_type: "invoice", resource_id: id, resource_label: String(invoice.invoice_number || "Invoice"), metadata: { submission_id: submissionId, reviewed_by: reviewer, amount: submission.amount, balance_due: invoice.balance_due } });
  return NextResponse.json({ invoice, payment: paymentResult.payment, receipt: receipt ? { ...receipt, invoice_number: invoice.invoice_number } : null });
}
