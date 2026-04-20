import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const { project_id = null, amount, currency = "NGN", paid_on, payment_ref, proof_url, notes } = body;
  if (amount == null || !paid_on) return NextResponse.json({ error: "amount and paid_on required" }, { status: 400 });
  const sb = financeDb();
  const { data, error } = await sb.from("finance_contractor_payments").insert({
    contractor_id: id, project_id, amount: Number(amount), currency, paid_on,
    payment_ref: payment_ref || null, proof_url: proof_url || null, notes: notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payment: data });
}
