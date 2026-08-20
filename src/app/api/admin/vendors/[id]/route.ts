import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

const VENDOR_TYPES = ["subcontractor", "vendor", "supplier", "partner"];
const AGREEMENT_STATUSES = ["none", "pending", "active", "expired"];
const EDITABLE = [
  "name", "business_niche", "phone", "whatsapp", "email",
  "office_location", "start_date", "notes",
  "vendor_type", "agreement_status", "agreement_notes",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (!(key in body)) continue;
    if (key === "vendor_type" && !VENDOR_TYPES.includes(body[key])) continue;
    if (key === "agreement_status" && !AGREEMENT_STATUSES.includes(body[key])) continue;
    const value = body[key];
    updates[key] = typeof value === "string" ? value.trim() || null : value ?? null;
  }
  if (!updates.name && "name" in body) {
    return NextResponse.json({ error: "Vendor name cannot be empty." }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes." }, { status: 400 });
  }

  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_contractors")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendor: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;
  const { id } = await params;
  const sb = financeDb();
  const { error } = await sb.from("finance_contractors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
