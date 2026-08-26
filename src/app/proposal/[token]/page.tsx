/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, Download } from "lucide-react";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeDeck } from "@/lib/proposal-deck";
import ProposalDeckView from "@/components/proposal/ProposalDeck";

export const dynamic = "force-dynamic";

type ProposalRow = {
  id: string;
  public_token: string;
  brand_name: string;
  title: string;
  focus_area: string;
  cover_storage_path: string | null;
  deck: unknown;
  created_at: string;
};

export default async function PublicDealProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const proposal = await glashMaybeOne<ProposalRow>(
    `select id,public_token,brand_name,title,focus_area,cover_storage_path,deck,created_at
       from public.deal_proposals
      where public_token=$1 and status in ('ready','sent','viewed','accepted')`,
    [token],
  );
  if (!proposal) notFound();

  // A client opening the link is the signal that moves the funnel forward.
  await glashQuery(
    `update public.deal_proposals
        set view_count=view_count+1, last_viewed_at=now(),
            first_viewed_at=coalesce(first_viewed_at, now()),
            stage=case when stage in ('sent','ready') then 'viewed' else stage end
      where id=$1`,
    [proposal.id],
  ).catch(() => undefined);
  await glashQuery(
    `insert into public.deal_proposal_events (proposal_id,event_type,detail) values ($1,'viewed','Proposal link opened')`,
    [proposal.id],
  ).catch(() => undefined);

  let coverUrl = "";
  if (proposal.cover_storage_path) {
    const storage = getSupabaseAdmin() as any;
    const { data } = await storage.storage.from("deals-assets").createSignedUrl(proposal.cover_storage_path, 3600);
    coverUrl = data?.signedUrl || "";
  }

  const deck = normalizeDeck(proposal.deck, {
    brandName: proposal.brand_name,
    focusArea: proposal.focus_area,
    title: proposal.title,
  });

  return (
    <main className="min-h-screen bg-[#EEF3FC] text-[#07133B]">
      <nav className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4">
          <Link href="/" className="text-sm font-bold">CDS Space</Link>
          <div className="flex items-center gap-2">
            {/* Relative, and carrying the proposal token, so the booking that
                comes back can be tied to this proposal on both surfaces. */}
            <Link
              href={`/consultation?proposal=${proposal.public_token}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-[#0A4FE8] transition hover:border-[#0A4FE8] hover:bg-blue-50"
            >
              <CalendarCheck className="h-4 w-4" />
              Kickoff Meet
            </Link>
            <a href={`/api/proposals/${proposal.public_token}/pdf`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 text-sm font-semibold text-white">
              <Download className="h-4 w-4" /> Download PDF
            </a>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-10">
        <ProposalDeckView deck={deck} brandName={proposal.brand_name} createdAt={proposal.created_at} coverUrl={coverUrl || null} />
        <footer className="py-10 text-center text-sm text-slate-500">
          Prepared by CDS Space Branding Agency · cdsspace.pro
        </footer>
      </div>
    </main>
  );
}
