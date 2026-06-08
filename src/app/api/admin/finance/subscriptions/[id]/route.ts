import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const allowed = ["project_id", "title", "source", "amount", "currency", "received_on", "payment_method", "reference", "notes"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  if ("amount" in patch) {
    const amount = Number(patch.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    patch.amount = amount;
  }
  if (typeof patch.title === "string") patch.title = patch.title.trim();
  const sb = financeDb();
  const { data, error } = await sb.from("finance_inflows").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inflow: data, subscription: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req); if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { error } = await sb.from("finance_inflows").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
