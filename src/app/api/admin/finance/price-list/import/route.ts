import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";

// CSV format: name,description,unit_price,currency,category
function parseCsv(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = (k: string) => header.indexOf(k);
  const out: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    // Naive CSV split - supports quoted fields with commas
    const row: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { row.push(cur); cur = ""; continue; }
      cur += ch;
    }
    row.push(cur);
    out.push({
      name: row[idx("name")] ?? "",
      description: row[idx("description")] ?? "",
      unit_price: row[idx("unit_price")] ?? "0",
      currency: (row[idx("currency")] ?? "NGN").toUpperCase(),
      category: row[idx("category")] ?? "",
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req); if (denied) return denied;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const text = await file.text();
  const rows = parseCsv(text);
  const valid = rows
    .filter((r) => r.name && !isNaN(Number(r.unit_price)))
    .map((r) => ({
      name: r.name,
      description: r.description || null,
      unit_price: Number(r.unit_price),
      currency: ["NGN", "RWF", "USD"].includes(r.currency) ? r.currency : "NGN",
      category: r.category || null,
    }));
  if (valid.length === 0) return NextResponse.json({ error: "no valid rows" }, { status: 400 });
  const sb = financeDb();
  const { error } = await sb.from("finance_price_items").insert(valid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: valid.length });
}
