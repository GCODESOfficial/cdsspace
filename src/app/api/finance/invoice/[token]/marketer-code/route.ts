import { NextRequest, NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z][A-Z0-9]{3,23}$/.test(code)) return NextResponse.json({ error: "Enter a valid marketer code." }, { status: 400 });
  const db = financeDb();
  let { data: invoice } = await db.from("finance_invoices").select("id,status,marketer_code").eq("public_token", token).maybeSingle();
  if (!invoice) {
    const result = await db.from("finance_invoices").select("id,status,marketer_code").ilike("invoice_number", token).maybeSingle();
    invoice = result.data;
  }
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.status === "paid" || invoice.status === "cancelled") return NextResponse.json({ error: "The marketer code cannot be changed after this invoice is paid or cancelled." }, { status: 409 });
  const { data: marketer } = await db.from("brand_marketers").select("user_id,display_name,full_name,marketer_code,status").eq("marketer_code", code).eq("status", "active").maybeSingle();
  if (!marketer) return NextResponse.json({ error: "This marketer code was not found or is not active." }, { status: 404 });
  const { data, error } = await db.from("finance_invoices").update({ marketer_code: code }).eq("id", invoice.id).select("marketer_code,marketer_attributed_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attribution: data, marketer: { name: marketer.display_name || marketer.full_name || "CDS Space Brand Marketer", code } });
}
