/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "doc"
  );
}

export async function GET(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "true";
  const db = supabaseAdmin as any;

  let query = db
    .from("v_team_cdocs_stats")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("last_viewed_at", { ascending: false, nullsFirst: false });

  if (!includeArchived) query = query.eq("is_archived", false);

  const { data: docs } = await query;
  return NextResponse.json({ ok: true, docs: docs || [] });
}

export async function POST(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { title, department, tags, cover_emoji } = body;
  if (!title?.trim()) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

  const db = supabaseAdmin as any;
  const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;

  const { data, error } = await db
    .from("team_cdocs")
    .insert({
      title: title.trim(),
      slug,
      body: "",
      cover_emoji: cover_emoji || "📄",
      department: department || null,
      tags: Array.isArray(tags) ? tags : [],
      created_by: team?.id || null,
      created_by_admin: !!admin,
    })
    .select("id, slug")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id, slug: data.slug });
}
