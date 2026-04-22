import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";
import { isMissingInvoiceExtensionColumn, stripInvoiceExtensionFields } from "@/lib/finance/invoice-schema-fallback";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
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
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const allowed = [
    "status", "client_name", "client_email", "client_address", "due_date", "notes",
    "payment_terms", "revisions_note", "working_hours", "delivery_speed", "delivery_period",
    "currency", "tax_rate", "discount", "scope", "period_month", "project_id", "milestone_id",
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];

  // Recalculate totals if items are provided
  if (body.items && Array.isArray(body.items)) {
    const subtotal = body.items.reduce((s: number, it: { quantity: number; unit_price: number }) => s + Number(it.quantity) * Number(it.unit_price), 0);
    const tax_rate = Number(body.tax_rate ?? patch.tax_rate ?? 0);
    const discount = Number(body.discount ?? patch.discount ?? 0);
    const tax_amount = (subtotal - discount) * (tax_rate / 100);
    const total = subtotal - discount + tax_amount;
    patch.subtotal = subtotal;
    patch.tax_amount = tax_amount;
    patch.total = total;
  }

  const sb = financeDb();
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

  return NextResponse.json({ invoice: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { error } = await sb.from("finance_invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
