import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { WhatsAppMode } from "@/lib/whatsapp/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();

  // 1. Check Env first
  if (process.env.WHATSAPP_CLOUD_ACCESS_TOKEN) {
    const envInteg = {
      id: "env",
      mode: (process.env.WHATSAPP_MODE || "cloud_api") as WhatsAppMode,
      is_active: true,
      cloud_phone_number_id: process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || null,
      cloud_waba_id: process.env.WHATSAPP_CLOUD_WABA_ID || null,
      cloud_access_token: `••••${String(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN).slice(-4)}`,
      cloud_access_token_set: true,
      cloud_verify_token: process.env.WHATSAPP_CLOUD_VERIFY_TOKEN || null,
      cloud_business_phone: process.env.WHATSAPP_CLOUD_BUSINESS_PHONE || null,
      cloud_app_id: process.env.WHATSAPP_CLOUD_APP_ID || null,
      updated_at: new Date().toISOString(),
    };
    return NextResponse.json({ integrations: [envInteg] });
  }

  const { data, error } = await supabase
    .from("whatsapp_integrations")
    .select("*")
    .order("mode", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Strip access token from response (only echo last 4 chars).
  const sanitised = (data || []).map((row) => {
    const tok = row.cloud_access_token;
    return {
      ...row,
      cloud_access_token: tok ? `••••${String(tok).slice(-4)}` : null,
      cloud_access_token_set: !!tok,
    };
  });
  return NextResponse.json({ integrations: sanitised });
}

export async function PUT(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const mode = body.mode as WhatsAppMode;
  if (mode !== "cloud_api" && mode !== "web_qr") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (mode === "cloud_api") {
    const fields = [
      "cloud_phone_number_id",
      "cloud_waba_id",
      "cloud_verify_token",
      "cloud_business_phone",
      "cloud_app_id",
    ] as const;
    for (const f of fields) if (typeof body[f] === "string") patch[f] = body[f];
    // Only overwrite access token if a new one was provided (and it's not the masked value).
    if (typeof body.cloud_access_token === "string" && !body.cloud_access_token.startsWith("••••")) {
      patch.cloud_access_token = body.cloud_access_token;
    }
  }

  const { error } = await supabase.from("whatsapp_integrations").update(patch).eq("mode", mode);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Activation: if is_active flipped to true, deactivate the other mode first.
  if (typeof body.is_active === "boolean") {
    if (body.is_active) {
      await supabase
        .from("whatsapp_integrations")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .neq("mode", mode);
    }
    await supabase
      .from("whatsapp_integrations")
      .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
      .eq("mode", mode);
  }

  return NextResponse.json({ ok: true });
}
