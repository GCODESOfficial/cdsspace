import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const { project_id, milestone_id = null, agreed_amount, currency = "NGN", notes } = body;
  if (!project_id || agreed_amount == null) return NextResponse.json({ error: "project_id and agreed_amount required" }, { status: 400 });
  const sb = financeDb();
  const { data, error } = await sb.from("finance_contractor_assignments").insert({
    contractor_id: id, project_id, milestone_id, agreed_amount: Number(agreed_amount), currency, notes: notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignment: data });
}
