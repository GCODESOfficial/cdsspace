import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req); if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_inflows")
    .select("*, finance_projects(name, client)")
    .order("received_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inflows: data ?? [], subscriptions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req); if (denied) return denied;
  const body = await req.json();
  const {
    project_id = null,
    title,
    source,
    amount,
    currency = "NGN",
    received_on,
    payment_method,
    reference,
    notes,
  } = body;
  if (!title || amount == null) return NextResponse.json({ error: "title and amount required" }, { status: 400 });
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  const sb = financeDb();
  const { data, error } = await sb.from("finance_inflows").insert({
    project_id,
    title: title.trim(),
    source: source || null,
    amount: normalizedAmount,
    currency,
    received_on: received_on || new Date().toISOString().slice(0, 10),
    payment_method: payment_method || null,
    reference: reference || null,
    notes: notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inflow: data, subscription: data });
}
