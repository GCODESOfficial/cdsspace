/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { closeStaleCmeets } from "@/lib/cmeet-autoclose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!code || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  await closeStaleCmeets();
  const actor = await getToolActor();
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("team_meetings")
    .select("id, room_code, title, agenda, audio_only, created_by, created_by_admin, started_at, ended_at, scheduled_for, status")
    .eq("room_code", code)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    meeting: { ...data, created_by: actor ? data.created_by : null },
    is_guest_view: !actor,
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const actor = await getToolActor();
  if (!actor || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin as any;
  const { data: m } = await db.from("team_meetings").select("id, created_by").eq("room_code", code).maybeSingle();
  if (!m) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!actor.is_admin && (actor.kind !== "team" || m.created_by !== actor.id)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  await db.from("team_meetings").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", m.id);
  return NextResponse.json({ ok: true });
}
