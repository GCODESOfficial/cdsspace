import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { isMissingInvoiceExtensionColumn, stripInvoiceExtensionFields } from "@/lib/finance/invoice-schema-fallback";
import { logActivity } from "@/lib/activity-log";
import { recordResourceVersion } from "@/lib/admin-versioning";
import { resolveClientBillingCurrency } from "@/lib/client-billing-server";
import { CURRENCIES, formatMoney } from "@/lib/finance/types";
import { emailInvoiceReceipt } from "@/lib/finance/receipt-server";
import { deliverInvoicePaymentConfirmation } from "@/lib/finance/payment-confirmation";
import { recordInvoicePayment } from "@/lib/finance/invoice-payments";
import { getAdminSessionAsync } from "@/app/api/admin-check/route";
import { denyPaidInvoiceEdit } from "@/lib/finance/paid-invoice-lock";
import { diffInvoiceSnapshots } from "@/lib/finance/invoice-diff";

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
    .neq("status", "initiated") // unpaid Paystack checkouts are not payments to review
    .order("submitted_at", { ascending: false });
  const { data: payments } = await sb
    .from("finance_invoice_payments")
    .select("id, amount, currency, paid_on, payment_method, payment_reference, source_type, notes, recorded_by, created_at")
    .eq("invoice_id", id)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
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
    payments: payments ?? [],
    paymentReminders: paymentReminders ?? [],
    receipt: receipt ? { ...receipt, invoice_number: invoice.invoice_number } : null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const isAutosave = req.headers.get("x-cds-silent") === "1";
  const isFinalSave = body?.finalize === true && !isAutosave;
  if (body?.status === "partially_paid" && body?.payment_amount === undefined) {
    return NextResponse.json({ error: "Partially paid is calculated from recorded payments. Use Record payment instead." }, { status: 400 });
  }
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
  const isPaymentUpdate = body.status === "paid" || body.payment_amount !== undefined;
  const permissionKey = isPaymentUpdate
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

  if (isPaymentUpdate) {
    const outstanding = Math.max(Number(before.invoice.total || 0) - Number(before.invoice.amount_paid || 0), 0);
    const amount = body.payment_amount === undefined ? outstanding : Number(body.payment_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a payment amount greater than zero." }, { status: 400 });
    }
    if (amount > outstanding + 0.01) {
      return NextResponse.json({ error: `Payment cannot exceed the outstanding balance of ${formatMoney(outstanding, before.invoice.currency)}.` }, { status: 400 });
    }
    const session = await getAdminSessionAsync(req);
    try {
      const result = await recordInvoicePayment({
        invoiceId: id,
        amount,
        currency: before.invoice.currency,
        paidOn: body.paid_on || null,
        paymentMethod: body.payment_method || "bank_transfer",
        paymentReference: body.payment_reference || null,
        sourceType: "manual",
        sourceId: body.idempotency_key || crypto.randomUUID(),
        notes: body.payment_note || null,
        recordedBy: session?.name || session?.email || "Finance admin",
      });
      const fullyPaid = result.invoice.status === "paid";
      await logActivity({
        action: fullyPaid ? "invoice.mark_paid" : "invoice.part_payment",
        page: "finance/invoices",
        resource_type: "invoice",
        resource_id: id,
        resource_label: `${before.invoice.invoice_number} · ${before.invoice.client_name}`,
        metadata: {
          amount,
          currency: before.invoice.currency,
          amount_paid: result.invoice.amount_paid,
          balance_due: result.invoice.balance_due,
          payment_percentage: result.invoice.payment_percentage,
          method: body.payment_method || "bank_transfer",
          reference: body.payment_reference || null,
        },
      });
      if (fullyPaid && before.invoice.status !== "paid") {
        await emailInvoiceReceipt(sb, id).catch(() => null);
        await deliverInvoicePaymentConfirmation(sb, id).catch(() => null);
      }
      return NextResponse.json({ invoice: result.invoice, payment: result.payment, fully_paid: fullyPaid });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Payment could not be recorded." }, { status: 400 });
    }
  }

  const locked = await denyPaidInvoiceEdit(req, before.invoice);
  if (locked) return locked;

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
    if (Number(before.invoice.amount_paid || 0) > 0 && String(patch.currency) !== String(before.invoice.currency)) {
      return NextResponse.json({ error: "The invoice currency cannot change after a payment has been recorded." }, { status: 409 });
    }
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

  if (patch.total !== undefined && Number(patch.total) + 0.01 < Number(before.invoice.amount_paid || 0)) {
    return NextResponse.json({ error: `The invoice total cannot be lower than the ${formatMoney(before.invoice.amount_paid, before.invoice.currency)} already paid.` }, { status: 409 });
  }

  if (isFinalSave || patch.status === "sent") {
    const finalItems = Array.isArray(body.items) ? body.items : before.items;
    const finalClientName = String(patch.client_name ?? before.invoice.client_name ?? "").trim();
    const finalTotal = Number(patch.total ?? before.invoice.total ?? 0);
    if (!finalClientName) {
      return NextResponse.json({ error: "Client name is required before the invoice can be saved." }, { status: 400 });
    }
    if (!finalItems.length || finalItems.some((item: any) => !String(item.name || "").trim() || Number(item.quantity) <= 0)) {
      return NextResponse.json({ error: "Add at least one complete invoice item before saving." }, { status: 400 });
    }
    if (finalTotal <= 0) {
      return NextResponse.json({ error: "Add a positive invoice amount before saving or marking it sent." }, { status: 400 });
    }
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

  const restoreInvoiceHeader = async () => {
    const rollback: Record<string, unknown> = {};
    for (const key of [...allowed, "subtotal", "tax_amount", "total"]) {
      if (key in before.invoice) rollback[key] = before.invoice[key];
    }
    let { error: rollbackError } = await sb.from("finance_invoices").update(rollback).eq("id", id);
    if (rollbackError && isMissingInvoiceExtensionColumn(rollbackError)) {
      ({ error: rollbackError } = await sb.from("finance_invoices").update(stripInvoiceExtensionFields(rollback)).eq("id", id));
    }
    if (rollbackError) console.error("[finance/invoices] failed to restore invoice header:", rollbackError.message);
  };

  // Update items if provided
  if (body.items && Array.isArray(body.items)) {
    const { error: deleteItemsError } = await sb.from("finance_invoice_items").delete().eq("invoice_id", id);
    if (deleteItemsError) {
      await restoreInvoiceHeader();
      return NextResponse.json({ error: deleteItemsError.message }, { status: 500 });
    }
    const itemRows = body.items.map((it: any, idx: number) => ({
      invoice_id: id,
      name: it.name,
      description: it.description || null,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      total: Number(it.quantity) * Number(it.unit_price),
      position: idx,
    }));
    const { error: insertItemsError } = await sb.from("finance_invoice_items").insert(itemRows);
    if (insertItemsError) {
      if (before.items.length > 0) {
        await sb.from("finance_invoice_items").insert(before.items.map((item: any, idx: number) => ({
          invoice_id: id,
          name: item.name,
          description: item.description || null,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          total: Number(item.total ?? Number(item.quantity) * Number(item.unit_price)),
          position: Number.isFinite(Number(item.position)) ? Number(item.position) : idx,
        })));
      }
      await restoreInvoiceHeader();
      return NextResponse.json({ error: insertItemsError.message }, { status: 500 });
    }
  }

  const { data: afterItems } = await sb
    .from("finance_invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position");

  // An invoice is created once. Later saves of the same record are updates,
  // compared against the last committed version rather than the editor's
  // autosaves, so the change list reflects everything done in that session.
  let previouslyCreated = false;
  let baseline = before;
  if (isFinalSave) {
    const { data: committedVersions } = await sb
      .from("admin_resource_versions")
      .select("action, after_data")
      .eq("resource_type", "invoice")
      .eq("resource_id", id)
      .neq("action", "invoice.draft_saved")
      .order("created_at", { ascending: false })
      .limit(50);
    previouslyCreated = (committedVersions ?? []).some((version: any) => version.action === "invoice.create");
    const committed = (committedVersions ?? []).find((version: any) => version.after_data?.invoice);
    if (committed) baseline = { invoice: committed.after_data.invoice, items: committed.after_data.items ?? [] };
  }

  const action = patch.status === "paid"
    ? "invoice.mark_paid"
    : isAutosave
      ? "invoice.draft_saved"
    : isFinalSave && before.invoice.status === "draft" && !previouslyCreated
      ? "invoice.create"
    : patch.status === "sent"
      ? "invoice.send"
      : "invoice.update";
  const changes = action === "invoice.update"
    ? diffInvoiceSnapshots(baseline, { invoice: data, items: afterItems ?? before.items })
    : null;
  const activityMetadata = changes
    ? {
        "Invoice": data?.invoice_number,
        "Client": data?.client_name,
        "Added": changes.added.join("; "),
        "Removed": changes.removed.join("; "),
        "Changed": changes.changed.join("; "),
        "Total": formatMoney(data?.total, data?.currency),
      }
    : isFinalSave
    ? {
        "Invoice": data?.invoice_number,
        "Client": data?.client_name,
        "Client email": data?.client_email,
        "Client address": data?.client_address,
        "Issue date": data?.issue_date,
        "Due date": data?.due_date,
        "Line items": afterItems?.length ?? 0,
        "Items": (afterItems ?? []).map((item: any) => `${item.name} × ${item.quantity} (${formatMoney(item.total, data?.currency)})`).join("; "),
        "Subtotal": formatMoney(data?.subtotal, data?.currency),
        "Discount": formatMoney(data?.discount, data?.currency),
        "Tax": formatMoney(data?.tax_amount, data?.currency),
        "Total": formatMoney(data?.total, data?.currency),
        "Currency": data?.currency,
        "Status": data?.status,
        "Payment terms": data?.payment_terms,
      }
    : { patch };
  await logActivity({
    action,
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: `${data?.invoice_number || id} · ${data?.client_name || ""}`.trim(),
    metadata: activityMetadata,
  });
  await recordResourceVersion({
    action,
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: `${data?.invoice_number || id} · ${data?.client_name || ""}`.trim(),
    before_data: before,
    after_data: { invoice: data, items: afterItems ?? before.items },
    metadata: activityMetadata,
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
