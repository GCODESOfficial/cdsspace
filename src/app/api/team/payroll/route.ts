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
    .from("team_payroll_entries")
    .select("*")
    .eq("team_member_id", session.id)
    .order("created_at", { ascending: false });

  const entries = rows || [];

  const next = entries
    .filter((e: any) => ["pending", "approved"].includes(e.status))
    .sort((a: any, b: any) => {
      const aDate = a.scheduled_for || a.created_at;
      const bDate = b.scheduled_for || b.created_at;
      return new Date(aDate).getTime() - new Date(bDate).getTime();
    })[0];

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytd_paid = entries
    .filter(
      (e: any) => e.status === "paid" && e.paid_on && new Date(e.paid_on) >= yearStart
    )
    .reduce((s: number, e: any) => s + Number(e.net_amount || 0), 0);

  const lifetime_paid = entries
    .filter((e: any) => e.status === "paid")
    .reduce((s: number, e: any) => s + Number(e.net_amount || 0), 0);

  return NextResponse.json({
    ok: true,
    data: {
      next_payment: next || null,
      ytd_paid,
      lifetime_paid,
      entries,
    },
  });
}
