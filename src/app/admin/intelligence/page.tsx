import Link from "next/link";
import { Plus } from "lucide-react";
import IntelligenceManager from "@/components/admin/intelligence/IntelligenceManager";
import IntelligenceShell from "@/components/admin/intelligence/IntelligenceShell";

export default function IntelligenceManagerPage() {
  return (
    <IntelligenceShell
      title="Intelligence"
      subtitle="Create, review, publish and measure CDS Space research from one dedicated workspace."
      action={
        <Link href="/admin/intelligence/create" className="inline-flex items-center gap-2 rounded-xl bg-[#0A4FE8] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#083EC0]">
          <Plus className="h-4 w-4" /> New publication
        </Link>
      }
    >
      <IntelligenceManager initialView="overview" />
    </IntelligenceShell>
  );
}
