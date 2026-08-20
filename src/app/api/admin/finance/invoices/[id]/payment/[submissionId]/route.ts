import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { emailInvoiceReceipt } from "@/lib/finance/receipt-server";
import { logActivity } from "@/lib/activity-log";
import { deliverInvoicePaymentConfirmation } from "@/lib/finance/payment-confirmation";

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

  const reviewer = session?.name || session?.email || "Finance admin";
  if (action === "reject") {
    const { data, error } = await db.from("invoice_payment_submissions").update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewer, admin_note: note, updated_at: new Date().toISOString() }).eq("id", submissionId).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logActivity({ action: "invoice.payment_rejected", page: "finance/invoices", resource_type: "invoice", resource_id: id, metadata: { submission_id: submissionId, note } });
    return NextResponse.json({ submission: data });
  }

  const { data: invoice, error: invoiceError } = await db.from("finance_invoices").update({ status: "paid" }).eq("id", id).select("*").single();
  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  // The paid-invoice database trigger confirms the pending submission and
  // issues the receipt. Add the human reviewer afterwards for the audit trail.
  await db.from("invoice_payment_submissions").update({ status: "confirmed", reviewed_at: new Date().toISOString(), reviewed_by: reviewer, admin_note: note, updated_at: new Date().toISOString() }).eq("id", submissionId);
  await emailInvoiceReceipt(db, id).catch(() => null);
  await deliverInvoicePaymentConfirmation(db, id).catch(() => null);
  const { data: receipt } = await db.from("finance_receipts").select("*").eq("invoice_id", id).maybeSingle();
  await logActivity({ action: "invoice.payment_confirmed", page: "finance/invoices", resource_type: "invoice", resource_id: id, resource_label: invoice.invoice_number, metadata: { submission_id: submissionId, reviewed_by: reviewer } });
  return NextResponse.json({ invoice, receipt: receipt ? { ...receipt, invoice_number: invoice.invoice_number } : null });
}
