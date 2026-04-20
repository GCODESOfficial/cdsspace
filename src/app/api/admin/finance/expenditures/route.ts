import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb.from("finance_expenditures").select("*").order("spent_on", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenditures: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const body = await req.json();
  const { title, category, amount, currency = "NGN", spent_on, recurring = false, recurrence_cycle, custom_interval_days, next_due_date, notes } = body;
  if (!title || amount == null) return NextResponse.json({ error: "title and amount required" }, { status: 400 });
  const sb = financeDb();
  const { data, error } = await sb.from("finance_expenditures").insert({
    title, category: category || null, amount: Number(amount), currency,
    spent_on: spent_on || new Date().toISOString().slice(0, 10),
    recurring, recurrence_cycle: recurring ? recurrence_cycle : null,
    custom_interval_days: recurring && recurrence_cycle === "custom" ? Number(custom_interval_days || 0) : null,
    next_due_date: next_due_date || null, notes: notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenditure: data });
}
