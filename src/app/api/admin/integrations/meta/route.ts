import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const platforms = ["facebook", "instagram"] as const;
  const integrations: any[] = [];

  for (const platform of platforms) {
    // Check Env first
    const envToken = platform === "facebook" ? process.env.FB_PAGE_ACCESS_TOKEN : process.env.IG_ACCESS_TOKEN;
    if (envToken) {
      integrations.push({
        id: `env_${platform}`,
        platform,
        is_active: true,
        page_id: (platform === "facebook" ? process.env.FB_PAGE_ID : process.env.IG_PAGE_ID) || null,
        page_name: (platform === "facebook" ? process.env.FB_PAGE_NAME : process.env.IG_PAGE_NAME) || `${platform.charAt(0).toUpperCase()}${platform.slice(1)} (Env)`,
        page_access_token: `••••${String(envToken).slice(-4)}`,
        page_access_token_set: true,
        ig_business_id: (platform === "instagram" ? process.env.IG_BUSINESS_ID : null) || null,
        ig_username: (platform === "instagram" ? process.env.IG_USERNAME : null) || null,
        verify_token: (platform === "facebook" ? process.env.FB_VERIFY_TOKEN : process.env.IG_VERIFY_TOKEN) || null,
        app_secret: "••••",
        app_secret_set: true,
        backfill_status: "idle",
        backfill_messages_ingested: 0,
        backfill_conversations_seen: 0,
      });
      continue;
    }

    // Fallback to DB
    const { data: dbData } = await supabase
      .from("meta_integrations")
      .select("*")
      .eq("platform", platform)
      .maybeSingle();

    if (dbData) {
      integrations.push({
        ...dbData,
        page_access_token: dbData.page_access_token ? `••••${String(dbData.page_access_token).slice(-4)}` : null,
        page_access_token_set: !!dbData.page_access_token,
        app_secret: dbData.app_secret ? `••••${String(dbData.app_secret).slice(-4)}` : null,
        app_secret_set: !!dbData.app_secret,
      });
    } else {
      // Ensure row exists for the UI
      integrations.push({ platform, is_active: false, id: `placeholder_${platform}` });
    }
  }

  return NextResponse.json({ integrations });
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
