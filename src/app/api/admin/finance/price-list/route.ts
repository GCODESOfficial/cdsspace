import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";

export async function GET(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const sb = financeDb();
  const { data, error } = await sb.from("finance_price_items").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const body = await req.json();
  const { name, description, unit_price, currency = "NGN", image_url, category } = body;
  if (!name || unit_price == null) return NextResponse.json({ error: "name and unit_price required" }, { status: 400 });
  const sb = financeDb();
  const { data, error } = await sb.from("finance_price_items")
    .insert({ name, description: description || null, unit_price: Number(unit_price), currency, image_url: image_url || null, category: category || null })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
