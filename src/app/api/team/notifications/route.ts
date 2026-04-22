/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getTeamSession();
  if (!session || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin as any;
  const { data } = await db
    .from("team_notifications")
    .select("*")
    .eq("recipient_id", session.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ ok: true, notifications: data || [] });
}

export async function PATCH(req: Request) {
  const session = await getTeamSession();
  if (!session || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { ids, all } = body as { ids?: string[]; all?: boolean };
  const db = supabaseAdmin as any;

  let query = db
    .from("team_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", session.id)
    .is("read_at", null);

  if (!all && ids?.length) query = query.in("id", ids);

  const { error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
