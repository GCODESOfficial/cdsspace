import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("meta_integrations")
    .select("*")
    .order("platform", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sanitised = (data || []).map((row) => ({
    ...row,
    page_access_token: row.page_access_token ? `••••${String(row.page_access_token).slice(-4)}` : null,
    page_access_token_set: !!row.page_access_token,
    app_secret: row.app_secret ? `••••${String(row.app_secret).slice(-4)}` : null,
    app_secret_set: !!row.app_secret,
  }));
  return NextResponse.json({ integrations: sanitised });
}

export async function PUT(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const platform = body.platform;
  if (platform !== "facebook" && platform !== "instagram") {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const stringFields = [
    "page_id",
    "page_name",
    "ig_business_id",
    "ig_username",
    "verify_token",
    "scopes",
  ] as const;
  for (const f of stringFields) if (typeof body[f] === "string") patch[f] = body[f];

  if (typeof body.page_access_token === "string" && !body.page_access_token.startsWith("••••")) {
    patch.page_access_token = body.page_access_token;
  }
  if (typeof body.app_secret === "string" && !body.app_secret.startsWith("••••")) {
    patch.app_secret = body.app_secret;
  }
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  const { error } = await supabase.from("meta_integrations").update(patch).eq("platform", platform);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
