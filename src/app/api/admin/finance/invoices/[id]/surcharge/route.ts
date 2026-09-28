import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { logActivity } from "@/lib/activity-log";
import { recordResourceVersion } from "@/lib/admin-versioning";
import { denyPaidInvoiceEdit } from "@/lib/finance/paid-invoice-lock";

async function getInvoiceSnapshot(sb: any, id: string) {
  const { data: invoice } = await sb
    .from("finance_invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const { data: items } = await sb
    .from("finance_invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("position");
  return { invoice: invoice ?? null, items: items ?? [] };
}

/**
 * Appends a delivery-speed surcharge line-item to an existing invoice and
 * recomputes subtotal / tax / total. Removes any prior "Delivery surcharge"
 * line so swapping speeds doesn't stack.
 * Body: { amount: number, note: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "finance_invoices.edit"); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const { amount, note } = body ?? {};
  if (!amount || amount <= 0 || !note) {
    return NextResponse.json({ error: "amount and note required" }, { status: 400 });
  }

  const sb = financeDb();
  const before = await getInvoiceSnapshot(sb, id);
  const { data: invoice, error: invErr } = await sb
    .from("finance_invoices")
    .select("id, invoice_number, client_name, currency, tax_rate, discount")
    .eq("id", id)
    .single();
  if (invErr || !invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const locked = await denyPaidInvoiceEdit(req, before.invoice);
  if (locked) return locked;

  // Wipe any existing surcharge row so repeated speed changes don't stack.
  await sb
    .from("finance_invoice_items")
    .delete()
    .eq("invoice_id", id)
    .ilike("name", "%delivery surcharge%");

  const { data: existing } = await sb
    .from("finance_invoice_items")
    .select("position")
    .eq("invoice_id", id);
  const nextPos = (existing?.length ?? 0);

  await sb.from("finance_invoice_items").insert({
    invoice_id: id,
    name: note,
    description: null,
    quantity: 1,
    unit_price: Number(amount),
    total: Number(amount),
    position: nextPos,
  });

  // Recompute subtotal + totals.
  const { data: items } = await sb
    .from("finance_invoice_items")
    .select("total")
    .eq("invoice_id", id);
  const subtotal = (items ?? []).reduce((s: number, r: { total: number }) => s + Number(r.total || 0), 0);
  const discount = Number(invoice.discount || 0);
  const taxRate = Number(invoice.tax_rate || 0);
  const tax_amount = Math.max(0, subtotal - discount) * (taxRate / 100);
  const total = Math.max(0, subtotal - discount) + tax_amount;

  await sb
    .from("finance_invoices")
    .update({ subtotal, tax_amount, total })
    .eq("id", id);

  const after = await getInvoiceSnapshot(sb, id);
  const resourceLabel = `${invoice.invoice_number || id} · ${invoice.client_name || ""}`.trim();
  await logActivity({
    action: "invoice.surcharge",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: resourceLabel,
    metadata: { amount: Number(amount), note },
  });
  await recordResourceVersion({
    action: "invoice.surcharge",
    page: "finance/invoices",
    resource_type: "invoice",
    resource_id: id,
    resource_label: resourceLabel,
    before_data: before,
    after_data: after,
    metadata: { amount: Number(amount), note },
  });

  return NextResponse.json({ ok: true, subtotal, tax_amount, total });
}
