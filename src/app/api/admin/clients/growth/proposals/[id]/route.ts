import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { buildGrowthProposalPdf, proposalFileName, type GrowthProposalDocument } from "@/lib/sales-growth-proposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin(req, "clients.growth.view");
  if (denied) return denied;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid proposal." }, { status: 400 });
  const proposal = await glashMaybeOne<GrowthProposalDocument & { campaign_name: string | null; service_niche: string | null }>(
    `select p.*, prospect.company_name, campaign.name campaign_name, campaign.service_niche
     from public.sales_growth_proposals p
     join public.sales_growth_prospects prospect on prospect.id=p.prospect_id
     left join public.sales_growth_campaigns campaign on campaign.id=p.campaign_id
     where p.id=$1`,
    [id],
  );
  if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  const pdf = buildGrowthProposalPdf(proposal);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${proposalFileName(proposal)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
