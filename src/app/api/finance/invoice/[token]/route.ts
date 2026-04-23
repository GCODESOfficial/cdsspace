import { NextRequest, NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";

/**
 * Public invoice lookup. Accepts EITHER the shareable `public_token` OR the
 * human-readable `invoice_number` (e.g. INV-202604-7227) so pasted links
 * work either way. We still only expose the invoice itself — no admin fields.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = financeDb();

  let { data: invoice } = await sb
    .from("finance_invoices")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();

  if (!invoice) {
    const { data: byNumber } = await sb
      .from("finance_invoices")
      .select("*")
      .ilike("invoice_number", token)
      .maybeSingle();
    invoice = byNumber;
  }

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: items } = await sb
    .from("finance_invoice_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("position");
  return NextResponse.json({ invoice, items: items ?? [] });
}
