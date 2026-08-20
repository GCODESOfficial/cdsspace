import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { DealProposalContent } from "@/lib/deals-ai";

export const dynamic = "force-dynamic";

type Proposal = {
  public_token: string;
  brand_name: string;
  title: string;
  focus_area: string;
  target_url: string | null;
  cover_storage_path: string | null;
  content: DealProposalContent;
  sources: Array<{ title?: string; url: string; kind?: string }>;
  created_at: string;
};

export default async function PublicDealProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const proposal = await glashMaybeOne<Proposal>(
    `select public_token,brand_name,title,focus_area,target_url,cover_storage_path,content,sources,created_at
       from public.deal_proposals
      where public_token=$1 and status in ('ready','sent','accepted')`,
    [token],
  );
  if (!proposal) notFound();

  let coverUrl = "";
  if (proposal.cover_storage_path) {
    const storage = getSupabaseAdmin() as any;
    const { data } = await storage.storage.from("deals-assets").createSignedUrl(proposal.cover_storage_path, 3600);
    coverUrl = data?.signedUrl || "";
  }
  const content = proposal.content || {} as DealProposalContent;
  const sources = Array.isArray(proposal.sources) ? proposal.sources : [];

  return (
    <main className="min-h-screen bg-[#F3F6FC] text-[#07133B]">
      <nav className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link href="/" className="text-sm font-bold">CDS Space</Link>
          <a href={`/api/proposals/${proposal.public_token}/pdf`} className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-sm font-semibold text-white">
            <Download className="h-4 w-4" /> Download PDF
          </a>
        </div>
      </nav>

      <article className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-12">
        {coverUrl ? (
          <div className="mx-auto mb-8 aspect-[210/297] max-w-[650px] overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(7,19,59,0.16)]">
            {/* The source is an expiring URL for a private, sanitised cover upload. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt={`${proposal.brand_name} proposal cover`} className="h-full w-full object-cover" />
          </div>
        ) : (
          <header className="mb-8 overflow-hidden rounded-[30px] bg-[#0A4FE8] px-7 py-16 text-white shadow-[0_24px_80px_rgba(10,79,232,0.2)] sm:px-14 sm:py-24">
            <p className="text-sm font-semibold text-blue-100">Prepared for {proposal.brand_name}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">{proposal.title}</h1>
            <p className="mt-8 text-sm text-blue-100">{new Date(proposal.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
          </header>
        )}

        <div className="space-y-6">
          <Section title="Executive summary"><p>{content.executive_summary}</p></Section>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Current state"><p>{content.current_state}</p></Section>
            <Section title="The opportunity"><p>{content.opportunity}</p></Section>
          </div>
          <Section title="Proposed approach">
            <p>{content.proposed_approach}</p>
            <List items={content.deliverables} />
          </Section>
          {content.market_metrics?.length > 0 && (
            <Section title="Market evidence">
              <div className="grid gap-3 sm:grid-cols-2">
                {content.market_metrics.map((metric, index) => (
                  <a key={`${metric.label}-${index}`} href={metric.source_url} target="_blank" rel="noreferrer" className="rounded-2xl bg-[#F3F6FC] p-4 transition hover:bg-blue-50">
                    <strong className="block text-2xl text-[#0A4FE8]">{metric.value}</strong>
                    <span className="mt-1 block font-semibold text-[#07133B]">{metric.label}</span>
                    <span className="mt-2 block text-sm text-slate-500">{metric.context}</span>
                  </a>
                ))}
              </div>
            </Section>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Expected impact"><List items={content.expected_impact} /></Section>
            <Section title="Timeline and next step"><p>{content.timeline}</p><p className="mt-4 font-semibold text-[#07133B]">{content.next_step}</p></Section>
          </div>
          {sources.length > 0 && (
            <Section title="Public sources">
              <div className="space-y-2">
                {sources.map((source, index) => (
                  <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-sm font-medium text-[#0A4FE8] hover:underline">
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" /> {source.title || source.url}
                  </a>
                ))}
              </div>
            </Section>
          )}
        </div>

        <footer className="py-10 text-center text-sm text-slate-500">Prepared by CDS Space Branding Agency · cdsspace.pro</footer>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[24px] border border-slate-200 bg-white p-6 leading-7 shadow-sm sm:p-8"><h2 className="mb-4 text-xl font-bold sm:text-2xl">{title}</h2><div className="text-[15px] text-slate-600">{children}</div></section>;
}

function List({ items }: { items?: string[] }) {
  if (!Array.isArray(items) || !items.length) return null;
  return <ul className="mt-5 space-y-3">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#0A4FE8]" /> <span>{item}</span></li>)}</ul>;
}
