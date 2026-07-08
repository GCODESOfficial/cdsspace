import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { isMissingInvoiceExtensionColumn, stripInvoiceExtensionFields } from "@/lib/finance/invoice-schema-fallback";
import { logActivity } from "@/lib/activity-log";
import { recordResourceVersion } from "@/lib/admin-versioning";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { formatMoney } from "@/lib/finance/types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://cdsspace.pro";

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
  return NextResponse.json({ invoice, items: items ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
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

  // Payment-confirmation email - fires only on the transition INTO "paid", and
  // only when the invoice carries a client email. Best-effort (never blocks the
  // status update).
  if (patch.status === "paid" && before.invoice.status !== "paid" && data?.client_email) {
    try {
      const url = `${SITE_URL}/invoice/${data.public_token}`;
      const html = brandedEmailHtml(
        `
        <h2 style="margin:0 0 12px;color:#0D1B39;">Payment confirmed</h2>
        <p>Hi ${data.client_name || "there"},</p>
        <p>We've received your payment for <strong>Invoice ${data.invoice_number}</strong> (${formatMoney(data.total, data.currency)}). It is now marked <strong>paid</strong> - thank you!</p>
        <p style="text-align:center;margin:24px 0;"><a href="${url}" style="display:inline-block;background:linear-gradient(146deg,#0035C1,#0575FF);color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;">View invoice</a></p>
        <p style="color:#6b7280;font-size:13px;">This email confirms your payment has been received and recorded. No further action is needed.</p>
      `,
        { eyebrow: "Payment Confirmed", preheader: `Payment received for Invoice ${data.invoice_number}` },
      );
      await sendEmail({
        to: data.client_email,
        subject: `Payment confirmed - Invoice ${data.invoice_number}`,
        html,
      });
      await logActivity({
        action: "invoice.payment_confirmation_email",
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
  const denied = await requireFinanceAdminAsync(req, "finance_invoices.delete"); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const before = await getInvoiceSnapshot(sb, id);
  const { error } = await sb.from("finance_invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    action: "invoice.delete",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: `${before.invoice?.invoice_number || id} · ${before.invoice?.client_name || ""}`.trim(),
  });
  await recordResourceVersion({
    action: "invoice.delete",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: `${before.invoice?.invoice_number || id} · ${before.invoice?.client_name || ""}`.trim(),
    before_data: before,
    after_data: null,
  });

  return NextResponse.json({ ok: true });
}
