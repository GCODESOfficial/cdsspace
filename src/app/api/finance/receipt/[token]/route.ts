import { NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = financeDb();
  let { data: receipt } = await db.from("finance_receipts").select("*").eq("public_token", token).maybeSingle();
  if (!receipt) {
    const result = await db.from("finance_receipts").select("*").ilike("receipt_number", token).maybeSingle();
    receipt = result.data;
  }
  if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

  const { data: invoice } = await db
    .from("finance_invoices")
    .select("*")
    .eq("id", receipt.invoice_id)
    .maybeSingle();
  const { data: items } = invoice ? await db.from("finance_invoice_items").select("*").eq("invoice_id", invoice.id).order("position") : { data: [] };
  const safeInvoice = invoice ? { ...invoice } : null;
  if (safeInvoice) {
    delete safeInvoice.user_id;
    delete safeInvoice.marketer_user_id;
  }
  return NextResponse.json({
    receipt: { ...receipt, invoice_number: invoice?.invoice_number || "Invoice", invoice: safeInvoice, items: items || [] },
    invoice_public_token: invoice?.public_token || null,
  });
}
