import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { data: contractor, error } = await sb.from("finance_contractors").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const { data: assignments } = await sb
    .from("finance_contractor_assignments")
    .select("*, finance_projects(name, client)")
    .eq("contractor_id", id);
  const { data: payments } = await sb
    .from("finance_contractor_payments")
    .select("*")
    .eq("contractor_id", id)
    .order("paid_on", { ascending: false });
  return NextResponse.json({ contractor, assignments: assignments ?? [], payments: payments ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const allowed = ["name", "business_niche", "phone", "whatsapp", "email", "bank_name", "account_name", "account_number", "bank_code", "office_location", "start_date", "notes"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  const sb = financeDb();
  const { data, error } = await sb.from("finance_contractors").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contractor: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { error } = await sb.from("finance_contractors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
