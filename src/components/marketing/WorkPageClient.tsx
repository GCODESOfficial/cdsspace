"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { WorkHero } from "@/components/marketing/WorkHero";
import type { Work } from "@/components/marketing/WorkGallery";

const WorkGallery = dynamic(
  () => import("@/components/marketing/WorkGallery").then((module) => ({ default: module.WorkGallery })),
  {
    loading: () => (
      <div className="px-6 py-20">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-brand-blue/20 border-t-brand-blue" />
      </div>
    ),
  },
);
const WorkDetailOverlay = dynamic(
  () => import("@/components/marketing/WorkDetailOverlay").then((module) => ({ default: module.WorkDetailOverlay })),
  { loading: () => null },
);

function validWorkId(value: string | null) {
  if (!value) return null;
  return /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(value)
    ? value
    : null;
}

export function WorkPageClient({
  initialWorks,
  loadError,
}: {
  initialWorks: Work[];
  loadError: boolean;
}) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [openWorkId, setOpenWorkId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    setOpenWorkId(validWorkId(searchParams.get("id")));
  }, [searchParams]);

  return (
    <main className="relative min-h-screen bg-brand-bg pb-40 selection:bg-brand-blue selection:text-white">
      <WorkHero
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <WorkGallery
        activeCategory={activeCategory}
        searchQuery={searchQuery}
        onOpen={setOpenWorkId}
        initialWorks={initialWorks}
        loadError={loadError}
      />
      <WorkDetailOverlay workId={openWorkId} onClose={() => setOpenWorkId(null)} />
    </main>
  );
}
