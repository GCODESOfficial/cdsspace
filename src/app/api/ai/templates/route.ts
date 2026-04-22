/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get("category");

  const db = supabaseAdmin as any;
  let q = db
    .from("ai_templates")
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("times_used", { ascending: false })
    .order("title");
  if (category) q = q.eq("category", category);
  const { data } = await q;
  return NextResponse.json({ ok: true, templates: data || [] });
}

export async function POST(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { title, category, emoji, description, body_template, ai_seed_prompt, variables } = body;
  if (!title?.trim() || !body_template?.trim()) {
    return NextResponse.json({ ok: false, error: "Title and body required" }, { status: 400 });
  }

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("ai_templates")
    .insert({
      title: title.trim(),
      category: category || "custom",
      emoji: emoji || "📝",
      description: description || null,
      body_template,
      ai_seed_prompt: ai_seed_prompt || null,
      variables: Array.isArray(variables) ? variables : [],
      is_builtin: false,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}
