/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildDealProposalPdf, dealProposalFileName, type DealProposalDocument } from "@/lib/deal-proposal-pdf";
import { normalizeDeck } from "@/lib/proposal-deck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new NextResponse("Proposal not found", { status: 404 });
  const proposal = await glashMaybeOne<DealProposalDocument & { cover_storage_path: string | null; cover_mime_type: string | null }>(
    `select * from public.deal_proposals where public_token=$1 and status in ('ready','sent','accepted')`, [token],
  );
  if (!proposal) return new NextResponse("Proposal not found", { status: 404 });
  let cover: { bytes: Uint8Array; mime: string } | null = null;
  if (proposal.cover_storage_path) {
    const storage = getSupabaseAdmin() as any;
    const { data } = await storage.storage.from("deals-assets").download(proposal.cover_storage_path);
    if (data) cover = { bytes: new Uint8Array(await (data as Blob).arrayBuffer()), mime: proposal.cover_mime_type || "image/webp" };
  }
  const deck = normalizeDeck((proposal as any).deck, { brandName: proposal.brand_name, focusArea: proposal.focus_area, title: proposal.title });
  await glashQuery(
    `insert into public.deal_proposal_events (proposal_id,event_type,detail)
     select id,'downloaded','Client downloaded the PDF' from public.deal_proposals where public_token=$1`,
    [token],
  ).catch(() => undefined);
  const pdf = await buildDealProposalPdf({ ...proposal, deck }, cover);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${dealProposalFileName(proposal)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
