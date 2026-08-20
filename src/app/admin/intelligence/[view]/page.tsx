import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import IntelligenceManager, { type IntelligenceModuleView } from "@/components/admin/intelligence/IntelligenceManager";
import IntelligenceShell from "@/components/admin/intelligence/IntelligenceShell";

const PAGE_META: Record<string, { view: IntelligenceModuleView; title: string; subtitle: string }> = {
  library: { view: "all", title: "Publication Library", subtitle: "Search, filter and manage every Intelligence publication." },
  create: { view: "create", title: "Create Publication", subtitle: "Build an optimized, PDF-first research publication for the Intelligence library." },
  private: { view: "private", title: "Private Reports", subtitle: "Manage client-only assessments and restricted research." },
  comments: { view: "comments", title: "Comment Moderation", subtitle: "Review reader discussion and keep publication conversations constructive." },
  analytics: { view: "analytics", title: "Intelligence Analytics", subtitle: "Track readership, document engagement, referrals and conversion signals." },
  authors: { view: "authors", title: "Authors and Contributors", subtitle: "Manage CDS Space contributors and credited report originators." },
  taxonomy: { view: "categories", title: "Taxonomy and Collections", subtitle: "Keep categories, tags and series consistent across the public library." },
  archive: { view: "archive", title: "Publication Archive", subtitle: "Review archived and deleted Intelligence publications." },
  settings: { view: "settings", title: "Intelligence Settings", subtitle: "Control document, discussion, analytics and editorial defaults." },
};

const LIBRARY_FILTERS = new Set<IntelligenceModuleView>(["reports", "audits", "benchmarks", "briefs", "cases"]);

export default async function IntelligenceSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<{ edit?: string; type?: string }>;
}) {
  const [{ view: slug }, query] = await Promise.all([params, searchParams]);
  const meta = PAGE_META[slug];
  if (!meta) notFound();

  const requestedFilter = query.type as IntelligenceModuleView | undefined;
  const initialView = slug === "library" && requestedFilter && LIBRARY_FILTERS.has(requestedFilter)
    ? requestedFilter
    : meta.view;
  const isEditor = slug === "create";

  return (
    <IntelligenceShell
      title={isEditor && query.edit ? "Edit Publication" : meta.title}
      subtitle={meta.subtitle}
      action={!isEditor ? (
        <Link href="/admin/intelligence/create" className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#083EC0]">
          <Plus className="h-4 w-4" /> New publication
        </Link>
      ) : undefined}
    >
      <IntelligenceManager initialView={initialView} editId={query.edit} />
    </IntelligenceShell>
  );
}
