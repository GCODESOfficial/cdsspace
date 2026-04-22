/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canManageAi(permissions: string[]) {
  return hasPermission(permissions, "workspace.ai_system") || hasPermission(permissions, "all");
}

function setupMessage(message: string) {
  return `${message} Run the latest AI system SQL/migration before opening this page.`;
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageAi(session.permissions)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured" }, { status: 500 });
  }

  const db = supabaseAdmin as any;
  const [settingsRes, docsRes, templatesRes, usageRes, dailyRes] = await Promise.all([
    db.from("ai_settings").select("*").eq("id", 1).maybeSingle(),
    db
      .from("ai_knowledge_documents")
      .select("id, title, category, description, tags, content_excerpt, file_name, file_mime, file_size_bytes, is_active, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50),
    db
      .from("ai_templates")
      .select("id, slug, title, category, emoji, description, body_template, ai_seed_prompt, variables, is_builtin, times_used, created_at, updated_at")
      .order("is_builtin", { ascending: false })
      .order("updated_at", { ascending: false }),
    db
      .from("ai_usage_log")
      .select("id, kind, actor_kind, model, prompt_tokens, completion_tokens, latency_ms, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("v_ai_usage_daily")
      .select("day, kind, calls, total_tokens, errors, avg_latency_ms")
      .order("day", { ascending: false })
      .limit(21),
  ]);

  const firstError =
    settingsRes.error || docsRes.error || templatesRes.error || usageRes.error || dailyRes.error;
  if (firstError) {
    return NextResponse.json(
      { ok: false, error: setupMessage(firstError.message || "Failed to load AI system data") },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    settings: settingsRes.data || {
      id: 1,
      enabled: true,
      allow_team: true,
      allow_public: false,
      daily_token_cap: 200000,
      default_model: "gpt-4o-mini",
    },
    documents: docsRes.data || [],
    templates: templatesRes.data || [],
    recent_usage: usageRes.data || [],
    daily_usage: dailyRes.data || [],
  });
}

export async function PATCH(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageAi(session.permissions)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const dailyTokenCap = Number(body.daily_token_cap);
  const patch = {
    enabled: body.enabled !== false,
    allow_team: body.allow_team !== false,
    allow_public: !!body.allow_public,
    daily_token_cap: Math.max(0, Number.isFinite(dailyTokenCap) ? dailyTokenCap : 0),
    default_model: String(body.default_model || "gpt-4o-mini").trim() || "gpt-4o-mini",
    updated_at: new Date().toISOString(),
  };

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("ai_settings")
    .upsert({ id: 1, ...patch }, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: setupMessage(error.message) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: data });
}
