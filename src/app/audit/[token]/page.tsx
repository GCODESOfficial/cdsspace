/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import AuditReport from "@/components/deals/AuditReport";

export const dynamic = "force-dynamic";

/**
 * The client's view of a brand audit. Read only: no editing, no admin chrome,
 * and it resolves only while the audit's share is switched on.
 */
export default async function PublicBrandAuditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const audit = await glashMaybeOne<any>(
    `select id, brand_name, target_url, overall_score, content, created_at
       from public.deal_brand_audits
      where public_token=$1 and share_enabled and status in ('generated','reviewed')`,
    [token],
  );
  if (!audit) notFound();

  // Opening the link is what tells Deals the audit has landed.
  await glashQuery(
    `update public.deal_brand_audits set view_count=view_count+1, last_viewed_at=now() where id=$1`,
    [audit.id],
  ).catch(() => undefined);

  return (
    <main className="min-h-screen bg-[#F3F6FC] p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#0A4FE8]">CDS Space</p>
            <h1 className="mt-1 text-2xl font-bold text-[#07133B] sm:text-3xl">Brand audit</h1>
            <p className="mt-2 text-sm text-slate-500">
              Prepared {new Date(audit.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} from publicly available evidence.
            </p>
          </div>
          <a
            href={`/api/audits/${token}/pdf`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-[#0A4FE8]"
          >
            <Download className="h-4 w-4" /> Download as PDF
          </a>
        </header>
        <AuditReport audit={audit} />
        <p className="mt-8 text-center text-xs text-slate-400">
          This audit is evidence-led and intended as the starting point for a working conversation.
        </p>
      </div>
    </main>
  );
}
