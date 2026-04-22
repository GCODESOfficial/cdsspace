/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function GET() {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = supabaseAdmin as any;
  const { data: stats } = await db
    .from("v_team_docs_stats")
    .select("*")
    .order("last_opened_at", { ascending: false, nullsFirst: false });

  return NextResponse.json({ ok: true, stats: stats || [] });
}
