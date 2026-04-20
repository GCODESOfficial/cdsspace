import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdmin } from "@/lib/finance/api-auth";
import { randomToken } from "@/lib/finance/types";

export async function GET(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const sb = financeDb();
  const { data } = await sb.from("finance_contractor_invites").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = requireFinanceAdmin(req); if (denied) return denied;
  const token = randomToken(28);
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  const sb = financeDb();
  const { data, error } = await sb.from("finance_contractor_invites").insert({ token, expires_at }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invite: data });
}
