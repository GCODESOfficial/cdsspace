import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("created_at, fields")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allKeys = new Set<string>(["Legal Name","Email","Interested Role"]);
  for (const r of data ?? []) for (const k of Object.keys(r.fields ?? {})) allKeys.add(k);
  const headers = ["created_at", ...Array.from(allKeys)];

  const rows = [headers.join(",")];
  for (const r of data ?? []) {
    const line = headers
      .map((h) => {
        const val = h === "created_at" ? r.created_at : (r.fields ?? {})[h];
        const s = String(val ?? "");
        return `"${s.replaceAll('"', '""')}"`;
      })
      .join(",");
    rows.push(line);
  }

  const csv = rows.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="applications.csv"`,
    },
  });
}
