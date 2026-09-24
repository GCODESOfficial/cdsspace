import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { CURRENCIES, type Currency } from "@/lib/finance/types";
import { assertSecureBuffer, UploadSecurityError } from "@/lib/upload-security";

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5_000;

function safeCell(value: string, max: number) {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

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
  return out.slice(0, MAX_ROWS);
}

export async function POST(req: NextRequest) {
  const denied = await requireFinanceAdminAsync(req); if (denied) return denied;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".csv")) return NextResponse.json({ error: "Only CSV files are accepted." }, { status: 400 });
  if (!file.size || file.size > MAX_CSV_BYTES) return NextResponse.json({ error: "CSV files must be 2MB or smaller." }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await assertSecureBuffer(buffer, { activeContent: true, fileName: file.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The CSV could not be security-scanned." },
      { status: error instanceof UploadSecurityError ? error.status : 400 },
    );
  }
  if (buffer.includes(0)) return NextResponse.json({ error: "The CSV contains invalid binary data." }, { status: 400 });
  const text = buffer.toString("utf8");
  const rows = parseCsv(text);
  const valid = rows
    .filter((r) => r.name && !isNaN(Number(r.unit_price)))
    .map((r) => ({
      name: safeCell(r.name, 180),
      description: safeCell(r.description, 2_000) || null,
      unit_price: Number(r.unit_price),
      currency: CURRENCIES.includes(r.currency as Currency) ? r.currency : "NGN",
      category: safeCell(r.category, 120) || null,
    }));
  if (valid.length === 0) return NextResponse.json({ error: "no valid rows" }, { status: 400 });
  const sb = financeDb();
  const { error } = await sb.from("finance_price_items").insert(valid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: valid.length });
}
