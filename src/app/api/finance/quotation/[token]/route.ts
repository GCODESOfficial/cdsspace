import { NextRequest, NextResponse } from "next/server";
import { financeDb } from "@/lib/finance/api-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = financeDb();

  let { data: quotation } = await sb
    .from("finance_quotations")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();

  if (!quotation) {
    const { data: byNumber } = await sb
      .from("finance_quotations")
      .select("*")
      .ilike("quotation_number", token)
      .maybeSingle();
    quotation = byNumber;
  }

  if (!quotation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: items }, { data: samples }] = await Promise.all([
    sb.from("finance_quotation_items").select("*").eq("quotation_id", quotation.id).order("position"),
    sb.from("finance_quotation_samples").select("*").eq("quotation_id", quotation.id).order("position"),
  ]);

  return NextResponse.json({ quotation, items: items ?? [], samples: samples ?? [] });
}
