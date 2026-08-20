import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function safeSearch(value: string) {
  return value.replace(/[,%()]/g, " ").trim().slice(0, 80);
}

export async function GET(request: NextRequest) {
  const denied = await requireFinanceAdminAsync(request, "brand_briefs");
  if (denied) return denied;

  const search = safeSearch(request.nextUrl.searchParams.get("q") || "");
  const db = getSupabaseAdmin() as any;
  let query = db
    .from("profiles")
    .select("id,email,full_name,company_name,avatar_url")
    .neq("email_verified_at", null)
    .eq("account_status", "active")
    .order("full_name", { ascending: true })
    .limit(100);
  if (search) query = query.or(`full_name.ilike.%${search}%,company_name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load client accounts." }, { status: 500 });
  return NextResponse.json({ clients: data || [] });
}
