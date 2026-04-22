import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

/**
 * Appends a delivery-speed surcharge line-item to an existing invoice and
 * recomputes subtotal / tax / total. Removes any prior "Delivery surcharge"
 * line so swapping speeds doesn't stack.
 * Body: { amount: number, note: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const { amount, note } = body ?? {};
  if (!amount || amount <= 0 || !note) {
    return NextResponse.json({ error: "amount and note required" }, { status: 400 });
  }

  const sb = financeDb();
  const { data: invoice, error: invErr } = await sb
    .from("finance_invoices")
    .select("id, currency, tax_rate, discount")
    .eq("id", id)
    .single();
  if (invErr || !invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

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

  return NextResponse.json({ ok: true, subtotal, tax_amount, total });
}
