import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

// Exports payroll items in the format: Account_Number,Amount,Bank_Codes,Narration
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { data: items, error } = await sb.from("finance_payroll_items").select("*").eq("payroll_run_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: run } = await sb.from("finance_payroll_runs").select("title").eq("id", id).single();
  const header = "Account_Number,Amount,Bank_Codes,Narration";
  const rows = (items ?? []).map((it: { account_number: string; amount: number; bank_code: string; narration: string }) =>
    `${it.account_number},${Number(it.amount).toFixed(2)},${it.bank_code},"${it.narration.replace(/"/g, '""')}"`
  );
  const csv = [header, ...rows].join("\n");
  const filename = `payroll_${(run?.title ?? "run").replace(/[^a-z0-9]/gi, "_")}.csv`;
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
