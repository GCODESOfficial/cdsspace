import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req);
  if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_projects")
    .select("*, finance_milestones(id, budget, paid_amount, status)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // compute totals per project
  const projects = (data ?? []).map((p: any) => {
    const ms = p.finance_milestones ?? [];
    const total_budget = ms.reduce((s: number, m: any) => s + Number(m.budget || 0), 0);
    const total_paid = ms.reduce((s: number, m: any) => s + Number(m.paid_amount || 0), 0);
    return { ...p, total_budget, total_paid, milestone_count: ms.length };
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req);
  if (denied) return denied;
  const body = await req.json();
  const { name, client, currency, duration_start, duration_end, notes } = body;
  if (!name || !client || !currency) {
    return NextResponse.json({ error: "name, client, currency required" }, { status: 400 });
  }
  if (!["NGN", "RWF", "USD"].includes(currency)) {
    return NextResponse.json({ error: "invalid currency" }, { status: 400 });
  }
  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_projects")
    .insert({ name, client, currency, duration_start: duration_start || null, duration_end: duration_end || null, notes: notes || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}
