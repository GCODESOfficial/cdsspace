import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdminSession } from "@/app/api/admin-check/route";

export async function GET(req: NextRequest) {
  if (!getAdminSession(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = getSupabaseAdmin();
  const { data, error } = await sb.from("consultation_requests").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ consultations: data ?? [] });
}
