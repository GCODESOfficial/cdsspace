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

  // Requests booked from a proposal's Kickoff Meet button carry proposal_id.
  // Resolve those in one extra query so the list can link straight back.
  const rows = data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proposalIds = [...new Set(rows.map((row: any) => row.proposal_id).filter(Boolean))];
  if (proposalIds.length) {
    const { data: proposals } = await sb
      .from("deal_proposals")
      .select("id, title, brand_name, public_token")
      .in("id", proposalIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map((proposals ?? []).map((p: any) => [p.id, p]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of rows as any[]) row.proposal = row.proposal_id ? byId.get(row.proposal_id) ?? null : null;
  }

  return NextResponse.json({ consultations: rows });
}
