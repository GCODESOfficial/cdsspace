import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb.from("finance_employees").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employees: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const sb = financeDb();
  const { data, error } = await sb.from("finance_employees").insert({
    name: body.name, role: body.role || null, email: body.email || null, phone: body.phone || null,
    bank_name: body.bank_name || null, bank_code: body.bank_code || null,
    account_number: body.account_number || null, account_name: body.account_name || null,
    base_salary: body.base_salary != null ? Number(body.base_salary) : null,
    currency: body.currency || "NGN", active: body.active ?? true,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employee: data });
}
