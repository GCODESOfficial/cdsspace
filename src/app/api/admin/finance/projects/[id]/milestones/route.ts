import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const {
    description,
    budget,
    assigned_to,
    duration_start,
    duration_end,
    payment_basis = "milestone",
    monthly_amount,
    paid_amount = 0,
    status = "pending",
  } = body;
  if (!description) return NextResponse.json({ error: "description required" }, { status: 400 });

  const sb = financeDb();
  // determine next position
  const { data: existing } = await sb.from("finance_milestones").select("position").eq("project_id", id);
  const nextPos = (existing?.length ?? 0);

  const { data, error } = await sb
    .from("finance_milestones")
    .insert({
      project_id: id,
      description,
      budget: Number(budget || 0),
      assigned_to: assigned_to || null,
      duration_start: duration_start || null,
      duration_end: duration_end || null,
      payment_basis,
      monthly_amount: payment_basis === "monthly" ? Number(monthly_amount || 0) : null,
      paid_amount: Number(paid_amount || 0),
      status,
      position: nextPos,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestone: data });
}
