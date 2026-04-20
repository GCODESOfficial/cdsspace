import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_subscriptions")
    .select("*, finance_projects(name, client)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const body = await req.json();
  const { project_id = null, name, category, amount, currency = "NGN", billing_cycle = "monthly", next_due_date, notes } = body;
  if (!name || amount == null) return NextResponse.json({ error: "name and amount required" }, { status: 400 });
  const sb = financeDb();
  const { data, error } = await sb.from("finance_subscriptions").insert({
    project_id, name, category: category || null, amount: Number(amount), currency, billing_cycle,
    next_due_date: next_due_date || null, notes: notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data });
}
