import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function normalizeCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
}

export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = normalizeCode((await request.json().catch(() => ({})))?.code);
  if (!code) return NextResponse.json({ error: "Enter a Special Offer Code." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("banner_discount_codes")
    .select("id, code, description, percentage, active, starts_at, expires_at")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const valid = data
    && (!data.starts_at || new Date(data.starts_at).getTime() <= now)
    && (!data.expires_at || new Date(data.expires_at).getTime() > now);
  if (!valid) return NextResponse.json({ error: "This Special Offer Code is invalid or no longer available." }, { status: 404 });

  return NextResponse.json({
    code: data.code,
    percentage: Number(data.percentage),
    description: data.description || null,
  });
}
