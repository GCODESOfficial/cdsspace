import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  // get run id first to recompute total
  const { data: it } = await sb.from("finance_payroll_items").select("payroll_run_id").eq("id", id).single();
  const { error } = await sb.from("finance_payroll_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (it?.payroll_run_id) {
    const { data: items } = await sb.from("finance_payroll_items").select("amount").eq("payroll_run_id", it.payroll_run_id);
    const total = (items ?? []).reduce((s: number, x: { amount: number }) => s + Number(x.amount), 0);
    await sb.from("finance_payroll_runs").update({ total }).eq("id", it.payroll_run_id);
  }
  return NextResponse.json({ ok: true });
}
