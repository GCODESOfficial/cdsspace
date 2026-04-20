import { NextRequest, NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = financeDb();
  const { data: invoice, error } = await sb
    .from("finance_invoices")
    .select("*")
    .eq("public_token", token)
    .single();
  if (error || !invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: items } = await sb
    .from("finance_invoice_items").select("*").eq("invoice_id", invoice.id).order("position");
  return NextResponse.json({ invoice, items: items ?? [] });
}
