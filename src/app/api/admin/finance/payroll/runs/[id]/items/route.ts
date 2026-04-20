import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

// Add an item to a run. Body: { employee_id?, account_number, amount, bank_code, narration }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const { employee_id = null, account_number, amount, bank_code, narration } = body;
  if (!account_number || !amount || !bank_code || !narration) {
    return NextResponse.json({ error: "account_number, amount, bank_code, narration required" }, { status: 400 });
  }
  const sb = financeDb();
  const { data, error } = await sb.from("finance_payroll_items").insert({
    payroll_run_id: id, employee_id, account_number, amount: Number(amount), bank_code, narration,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // recompute total
  const { data: items } = await sb.from("finance_payroll_items").select("amount").eq("payroll_run_id", id);
  const total = (items ?? []).reduce((s: number, it: { amount: number }) => s + Number(it.amount), 0);
  await sb.from("finance_payroll_runs").update({ total }).eq("id", id);

  return NextResponse.json({ item: data });
}
