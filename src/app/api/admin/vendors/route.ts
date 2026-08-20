import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

const VENDOR_TYPES = ["subcontractor", "vendor", "supplier", "partner"];
const AGREEMENT_STATUSES = ["none", "pending", "active", "expired"];

/** Vendors registry (CRM). Backed by finance_contractors, gated on CRM access. */
export async function GET(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_contractors")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendors: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req, "clients");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  if (!name) return NextResponse.json({ error: "Vendor name is required." }, { status: 400 });

  const vendor_type = VENDOR_TYPES.includes(body?.vendor_type) ? body.vendor_type : "vendor";
  const agreement_status = AGREEMENT_STATUSES.includes(body?.agreement_status) ? body.agreement_status : "none";

  const sb = financeDb();
  const { data, error } = await sb
    .from("finance_contractors")
    .insert({
      name,
      vendor_type,
      agreement_status,
      agreement_notes: body?.agreement_notes?.toString().trim() || null,
      business_niche: body?.business_niche?.toString().trim() || null,
      phone: body?.phone?.toString().trim() || null,
      whatsapp: body?.whatsapp?.toString().trim() || null,
      email: body?.email?.toString().trim() || null,
      office_location: body?.office_location?.toString().trim() || null,
      start_date: body?.start_date || null,
      notes: body?.notes?.toString().trim() || null,
      source: "crm",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendor: data });
}
