/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

function canManageAi(permissions: string[]) {
  return hasPermission(permissions, "workspace.ai_system") || hasPermission(permissions, "all");
}

function normalizeVariables(input: unknown) {
  if (Array.isArray(input)) return input;
  if (typeof input === "string" && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageAi(session.permissions)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured" }, { status: 500 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch = {
    title: String(body.title || "").trim(),
    category: String(body.category || "custom").trim(),
    emoji: String(body.emoji || "📝"),
    description: String(body.description || "").trim() || null,
    body_template: String(body.body_template || "").trim(),
    ai_seed_prompt: String(body.ai_seed_prompt || "").trim() || null,
    variables: normalizeVariables(body.variables),
  };

  if (!patch.title || !patch.body_template) {
    return NextResponse.json({ ok: false, error: "Title and body are required" }, { status: 400 });
  }

  const { data, error } = await (supabaseAdmin as any)
    .from("ai_templates")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageAi(session.permissions)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured" }, { status: 500 });
  }

  const { id } = await params;
  const { data: existing } = await (supabaseAdmin as any)
    .from("ai_templates")
    .select("id, is_builtin")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
  if (existing.is_builtin) {
    return NextResponse.json({ ok: false, error: "Built-in templates cannot be deleted" }, { status: 400 });
  }

  const { error } = await (supabaseAdmin as any).from("ai_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
