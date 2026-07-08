import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-api-auth";

export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin(req, "consultations");
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = getSupabaseAdmin();
  const { data, error } = await sb.from("consultation_requests").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ consultations: data ?? [] });
}
