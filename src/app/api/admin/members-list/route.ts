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
  const { data } = await db
    .from("team_members")
    .select("id, full_name, username, department, role_title, avatar_url")
    .eq("is_active", true)
    .order("full_name");

  return NextResponse.json({ ok: true, members: data || [] });
}
