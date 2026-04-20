import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { data: invoice, error } = await sb
    .from("finance_invoices")
    .select("*, finance_projects(name, client)")
    .eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const { data: items } = await sb
    .from("finance_invoice_items").select("*").eq("invoice_id", id).order("position");
  return NextResponse.json({ invoice, items: items ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const allowed = ["status", "client_name", "client_email", "client_address", "due_date", "notes"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  const sb = financeDb();
  const { data, error } = await sb.from("finance_invoices").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { error } = await sb.from("finance_invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
