/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { generateInvoiceNumber, randomToken } from "@/lib/finance/types";
import { logActivity } from "@/lib/activity-log";
import { recordResourceVersion } from "@/lib/admin-versioning";

async function getQuotationSnapshot(sb: any, id: string) {
  const { data: quotation, error } = await sb
    .from("finance_quotations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !quotation) return { quotation: null, items: [], samples: [] };

  const [{ data: items }, { data: samples }] = await Promise.all([
    sb.from("finance_quotation_items").select("*").eq("quotation_id", id).order("position"),
    sb.from("finance_quotation_samples").select("*").eq("quotation_id", id).order("position"),
  ]);
  return { quotation, items: items ?? [], samples: samples ?? [] };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_quotations.convert");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sb = financeDb();
  const before = await getQuotationSnapshot(sb, id);

  if (!before.quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  if (before.quotation.converted_invoice_id) {
    const { data: invoice } = await sb
      .from("finance_invoices")
      .select("*")
      .eq("id", before.quotation.converted_invoice_id)
      .maybeSingle();
    return NextResponse.json({ invoice, quotation: before.quotation, alreadyConverted: true });
  }
  if (!before.items.length) return NextResponse.json({ error: "Quotation has no items to convert." }, { status: 400 });

  const invoice_number = generateInvoiceNumber();
  const public_token = randomToken(28);
  const invoiceNotes = [
    before.quotation.notes,
    `Converted from quotation ${before.quotation.quotation_number}.`,
  ].filter(Boolean).join("\n\n");

  const invoicePayload = {
    invoice_number,
    project_id: before.quotation.project_id,
    milestone_id: before.quotation.milestone_id,
    client_name: before.quotation.client_name,
    client_email: before.quotation.client_email,
    client_address: before.quotation.client_address,
    currency: before.quotation.currency,
    subtotal: before.quotation.subtotal,
    tax_rate: before.quotation.tax_rate,
    tax_amount: before.quotation.tax_amount,
    discount: before.quotation.discount,
    total: before.quotation.total,
    status: body.status === "sent" ? "sent" : "draft",
    scope: before.quotation.scope,
    period_month: before.quotation.period_month,
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: null,
    notes: invoiceNotes || null,
    revisions_note: before.quotation.revisions_note || undefined,
    working_hours: before.quotation.working_hours || undefined,
    delivery_speed: "standard",
    delivery_period: before.quotation.delivery_period || null,
    public_token,
  };

  const { data: invoice, error: invoiceError } = await sb
    .from("finance_invoices")
    .insert(invoicePayload)
    .select()
    .single();

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });

  const invoiceItems = before.items.map((item: any, idx: number) => ({
    invoice_id: invoice.id,
    name: item.name,
    description: item.description || null,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    total: Number(item.total ?? Number(item.quantity) * Number(item.unit_price)),
    position: Number.isFinite(Number(item.position)) ? Number(item.position) : idx,
  }));
  const { error: itemError } = await sb.from("finance_invoice_items").insert(invoiceItems);
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });

  const { data: quotation, error: quoteError } = await sb
    .from("finance_quotations")
    .update({
      status: "converted",
      converted_invoice_id: invoice.id,
      converted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (quoteError) return NextResponse.json({ error: quoteError.message }, { status: 500 });

  const after = await getQuotationSnapshot(sb, id);
  const quoteLabel = `${quotation.quotation_number} - ${quotation.project_name} - ${quotation.client_name}`;
  const invoiceLabel = `${invoice.invoice_number} - ${invoice.client_name}`;
  const metadata = { invoice_id: invoice.id, invoice_number: invoice.invoice_number };

  await logActivity({
    action: "quotation.convert",
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: id,
    resource_label: quoteLabel,
    metadata,
  });
  await recordResourceVersion({
    action: "quotation.convert",
    page: "finance/quotations",
    resource_type: "quotation",
    resource_id: id,
    resource_label: quoteLabel,
    before_data: before,
    after_data: after,
    metadata,
  });

  await logActivity({
    action: "invoice.create",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: invoice.id,
    resource_label: invoiceLabel,
    metadata: { total: invoice.total, currency: invoice.currency, status: invoice.status, quotation_id: id },
  });
  await recordResourceVersion({
    action: "invoice.create",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: invoice.id,
    resource_label: invoiceLabel,
    before_data: {},
    after_data: { invoice, items: invoiceItems, source_quotation: before.quotation },
    metadata: { total: invoice.total, currency: invoice.currency, status: invoice.status, quotation_id: id },
  });

  return NextResponse.json({ invoice, quotation });
}
