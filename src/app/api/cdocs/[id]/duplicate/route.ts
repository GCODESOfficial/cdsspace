/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin as any;
  const { data: src } = await db.from("team_cdocs").select("*").eq("id", id).maybeSingle();
  if (!src) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data, error } = await db
    .from("team_cdocs")
    .insert({
      title: `${src.title} (Copy)`,
      body: src.body,
      theme: src.theme,
      department: src.department,
      tags: src.tags,
      category: src.category,
      subcategory: src.subcategory,
      stamped: src.stamped,
      share_token: crypto.randomBytes(16).toString("hex"),
      created_by: actor.kind === "team" ? actor.id : null,
      created_by_admin: actor.is_admin,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await db.from("team_cdocs_activity").insert({
    cdoc_id: data.id,
    actor_member_id: actor.kind === "team" ? actor.id : null,
    actor_is_admin: actor.is_admin,
    actor_name: actor.name,
    action: "created",
    detail: `duplicated from ${src.title}`,
  });

  return NextResponse.json({ ok: true, doc: data });
}
