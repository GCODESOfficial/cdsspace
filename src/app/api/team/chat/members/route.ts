/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getChatViewer } from "@/lib/team-chat-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getChatViewer();
  if (!viewer || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_members")
    .select("id, full_name, avatar_url, role_title, department")
    .eq("is_active", true)
    .order("full_name");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const list = data || [];
  
  // Prepend a virtual "Admin" account at the top
  const adminAccount = {
    id: "admin",
    full_name: "Admin",
    avatar_url: null,
    role_title: "System Administrator",
    department: "Support"
  };

  const withAdmin = [adminAccount, ...list];

  // Filter out the current user if they are a team member
  const filtered = viewer.kind === "team"
    ? withAdmin.filter((m: any) => m.id !== viewer.session.id)
    : withAdmin;

  return NextResponse.json({ ok: true, members: filtered });
}
