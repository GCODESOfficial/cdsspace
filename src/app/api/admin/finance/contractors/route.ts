import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb.from("finance_contractors").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contractors: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const sb = financeDb();
  const { data, error } = await sb.from("finance_contractors").insert({
    name: body.name,
    business_niche: body.business_niche || null,
    phone: body.phone || null,
    whatsapp: body.whatsapp || null,
    email: body.email || null,
    bank_name: body.bank_name || null,
    account_name: body.account_name || null,
    account_number: body.account_number || null,
    bank_code: body.bank_code || null,
    office_location: body.office_location || null,
    start_date: body.start_date || null,
    notes: body.notes || null,
    source: "admin",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contractor: data });
}
