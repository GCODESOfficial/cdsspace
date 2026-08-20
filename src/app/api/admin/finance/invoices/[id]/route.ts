import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { isMissingInvoiceExtensionColumn, stripInvoiceExtensionFields } from "@/lib/finance/invoice-schema-fallback";
import { logActivity } from "@/lib/activity-log";
import { recordResourceVersion } from "@/lib/admin-versioning";
import { resolveClientBillingCurrency } from "@/lib/client-billing-server";
import { CURRENCIES } from "@/lib/finance/types";
import { emailInvoiceReceipt } from "@/lib/finance/receipt-server";
import { deliverInvoicePaymentConfirmation } from "@/lib/finance/payment-confirmation";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";

async function getInvoiceSnapshot(sb: any, id: string) {
  const { data: invoice, error } = await sb
    .from("finance_invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !invoice) return { invoice: null, items: [] };
  const { data: items } = await sb
    .from("finance_invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position");
  return { invoice, items: items ?? [] };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_invoices"); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { data: invoice, error } = await sb
    .from("finance_invoices")
    .select("*, finance_projects(name, client)")
    .eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const { data: items } = await sb
    .from("finance_invoice_items").select("*").eq("invoice_id", id).order("position");
  const { data: bannerOrder } = await sb
    .from("banner_requests")
    .select("id, is_custom")
    .eq("invoice_id", id)
    .limit(1)
    .maybeSingle();
  const { data: paymentSubmissions } = await sb
    .from("invoice_payment_submissions")
    .select("*")
    .eq("invoice_id", id)
    .order("submitted_at", { ascending: false });
  const submissionsWithProof = await Promise.all((paymentSubmissions ?? []).map(async (submission: Record<string, any>) => {
    let proofUrl: string | null = null;
    if (submission.proof_storage_path) {
      const { data } = await (sb as any).storage.from("payment-proofs").createSignedUrl(submission.proof_storage_path, 60 * 60);
      proofUrl = data?.signedUrl || null;
    }
    const safe: Record<string, any> = { ...submission, proof_url: proofUrl };
    delete safe.proof_storage_path;
    return safe;
  }));
  const { data: receipt } = await sb.from("finance_receipts").select("*").eq("invoice_id", id).maybeSingle();
  const { data: paymentReminders } = await sb
    .from("invoice_payment_reminders")
    .select("id, sent_by, chat_sent_at, email_to, email_sent_at, email_error, created_at")
    .eq("invoice_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  return NextResponse.json({
    invoice,
    items: items ?? [],
    bannerOrder: bannerOrder ?? null,
    paymentSubmissions: submissionsWithProof,
    paymentReminders: paymentReminders ?? [],
    receipt: receipt ? { ...receipt, invoice_number: invoice.invoice_number } : null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (body?.restore === true) {
    const session = await getAdminSessionAsync(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "super_admin") return NextResponse.json({ error: "Only a super admin can restore an archived invoice." }, { status: 403 });
    const sb = financeDb();
    const { data, error } = await sb.from("finance_invoices").update({ deleted_at: null, deleted_by: null, deletion_reason: null }).eq("id", id).not("deleted_at", "is", null).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logActivity({ action: "invoice.restore", page: "finance/invoices", resource_type: "invoice", resource_id: id, resource_label: `${data.invoice_number} · ${data.client_name}` });
    return NextResponse.json({ invoice: data });
  }
  const bodyKeys = Object.keys(body ?? {});
  const permissionKey = bodyKeys.length === 1 && body.status === "paid"
    ? "finance_invoices.mark_paid"
    : "finance_invoices.edit";
  const denied = await requireFinanceAdminAsync(req, permissionKey); if (denied) return denied;
  const allowed = [
    "status", "client_name", "client_email", "client_address", "issue_date", "due_date", "notes",
    "payment_terms", "revisions_note", "working_hours", "delivery_speed", "delivery_period",
    "currency", "tax_rate", "discount", "scope", "period_month", "project_id", "milestone_id",
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];

  const sb = financeDb();
  const before = await getInvoiceSnapshot(sb, id);
  if (!before.invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  if ("delivery_period" in body) {
    const { data: linkedBanner } = await sb
      .from("banner_requests")
      .select("is_custom")
      .eq("invoice_id", id)
      .limit(1)
      .maybeSingle();
    if (linkedBanner && !linkedBanner.is_custom && body.delivery_period !== "3 business days") {
      return NextResponse.json({ error: "Standard banner orders use a fixed 3 business day production period. Only custom banner orders can change it." }, { status: 409 });
    }
  }

  if ("currency" in body || "client_email" in body) {
    const requestedCurrency = CURRENCIES.includes(String(body.currency || before.invoice.currency).toUpperCase() as (typeof CURRENCIES)[number])
      ? String(body.currency || before.invoice.currency).toUpperCase()
      : String(before.invoice.currency || "NGN");
    patch.currency = await resolveClientBillingCurrency(
      sb,
      body.client_email ?? before.invoice.client_email,
      requestedCurrency,
    );
  }

  // Recalculate totals if items are provided
  if (body.items && Array.isArray(body.items)) {
    const subtotal = body.items.reduce((s: number, it: { quantity: number; unit_price: number }) => s + Number(it.quantity) * Number(it.unit_price), 0);
    const tax_rate = Number(body.tax_rate ?? patch.tax_rate ?? before.invoice.tax_rate ?? 0);
    const discount = Number(body.discount ?? patch.discount ?? before.invoice.discount ?? 0);
    const tax_amount = (subtotal - discount) * (tax_rate / 100);
    const total = subtotal - discount + tax_amount;
    patch.subtotal = subtotal;
    patch.tax_amount = tax_amount;
    patch.total = total;
  }

  let { data, error } = await sb.from("finance_invoices").update(patch).eq("id", id).select().single();
  if (error && isMissingInvoiceExtensionColumn(error)) {
    const fallbackPatch = stripInvoiceExtensionFields(patch);
    if (Object.keys(fallbackPatch).length > 0) {
      ({ data, error } = await sb.from("finance_invoices").update(fallbackPatch).eq("id", id).select().single());
    } else {
      ({ data, error } = await sb.from("finance_invoices").select("*").eq("id", id).single());
    }
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update items if provided
  if (body.items && Array.isArray(body.items)) {
    await sb.from("finance_invoice_items").delete().eq("invoice_id", id);
    const itemRows = body.items.map((it: any, idx: number) => ({
      invoice_id: id,
      name: it.name,
      description: it.description || null,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      total: Number(it.quantity) * Number(it.unit_price),
      position: idx,
    }));
    await sb.from("finance_invoice_items").insert(itemRows);
  }

  const { data: afterItems } = await sb
    .from("finance_invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position");

  const action = patch.status === "paid"
    ? "invoice.mark_paid"
    : patch.status === "sent"
      ? "invoice.send"
      : "invoice.update";
  await logActivity({
    action,
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: `${data?.invoice_number || id} · ${data?.client_name || ""}`.trim(),
    metadata: { patch },
  });
  await recordResourceVersion({
    action,
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: `${data?.invoice_number || id} · ${data?.client_name || ""}`.trim(),
    before_data: before,
    after_data: { invoice: data, items: afterItems ?? before.items },
    metadata: { patch },
  });

  // Receipt email - best effort and sent only once after the database trigger
  // has issued the immutable receipt for the paid transition.
  if (patch.status === "paid" && before.invoice.status !== "paid" && data?.client_email) {
    try {
      await emailInvoiceReceipt(sb, id);
      await deliverInvoicePaymentConfirmation(sb, id);
      await logActivity({
        action: "invoice.receipt_email",
        page: "finance/invoices",
        resource_type: "invoice",
        resource_id: id,
        resource_label: `${data.invoice_number} → ${data.client_email}`,
      });
    } catch {
      // Non-fatal: the invoice is still marked paid even if the email fails.
    }
  }

  return NextResponse.json({ invoice: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSessionAsync(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin") return NextResponse.json({ error: "Only a super admin can archive an invoice." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || "").trim();
  if (reason.length < 5) return NextResponse.json({ error: "A clear reason for archiving this invoice is required." }, { status: 400 });
  const sb = financeDb();
  const before = await getInvoiceSnapshot(sb, id);
  if (!before.invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const { data: archived, error } = await sb.from("finance_invoices").update({
    deleted_at: new Date().toISOString(),
    deleted_by: session.email,
    deletion_reason: reason,
  }).eq("id", id).is("deleted_at", null).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    action: "invoice.archive",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: `${before.invoice?.invoice_number || id} · ${before.invoice?.client_name || ""}`.trim(),
    metadata: { reason, archived_by: session.email },
  });
  await recordResourceVersion({
    action: "invoice.archive",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: `${before.invoice?.invoice_number || id} · ${before.invoice?.client_name || ""}`.trim(),
    before_data: before,
    after_data: { invoice: archived, items: before.items },
    metadata: { reason, archived_by: session.email },
  });

  return NextResponse.json({ ok: true });
}
