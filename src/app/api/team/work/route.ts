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

  const { data: rows } = await db
    .from("team_work_assignments")
    .select("id, work_id, role_on_work, status, assigned_at, completed_at")
    .eq("team_member_id", session.id)
    .order("assigned_at", { ascending: false });

  const assignments = rows || [];
  const workIds = assignments.map((a: any) => a.work_id).filter(Boolean);

  let worksById: Record<number, any> = {};
  if (workIds.length > 0) {
    const { data: works } = await db
      .from("works")
      .select("id, title, category, cover_image, created_at")
      .in("id", workIds);
    (works || []).forEach((w: any) => {
      worksById[w.id] = w;
    });
  }

  const merged = assignments
    .map((a: any) => ({
      ...a,
      work: a.work_id ? worksById[a.work_id] || null : null,
    }))
    .filter((a: any) => a.work);

  return NextResponse.json({ ok: true, assignments: merged });
}
