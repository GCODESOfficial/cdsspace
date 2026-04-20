import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb.from("finance_payroll_runs").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const body = await req.json();
  const { title, period, currency = "NGN" } = body;
  if (!title || !period) return NextResponse.json({ error: "title and period required" }, { status: 400 });
  const sb = financeDb();
  const { data, error } = await sb.from("finance_payroll_runs").insert({ title, period, currency }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ run: data });
}
