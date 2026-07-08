"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { WorkHero } from "@/components/marketing/WorkHero";

const WorkGallery = dynamic(
    () => import("@/components/marketing/WorkGallery").then((m) => ({ default: m.WorkGallery })),
    {
        loading: () => (
            <div className="px-6 py-20">
                <div className="mx-auto h-12 w-12 rounded-full border-2 border-brand-blue/20 border-t-brand-blue animate-spin" />
            </div>
        ),
    },
);
const WorkDetailOverlay = dynamic(
    () => import("@/components/marketing/WorkDetailOverlay").then((m) => ({ default: m.WorkDetailOverlay })),
    { loading: () => null },
);

export default function WorkPage() {
    const [activeCategory, setActiveCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [openWorkId, setOpenWorkId] = useState<number | null>(null);
    const searchParams = useSearchParams();

    // Honor deep links like /work?id=123 by opening the overlay on arrival.
    useEffect(() => {
        const id = searchParams.get("id");
        const parsed = id ? Number(id) : NaN;
        if (Number.isFinite(parsed) && parsed > 0) {
            setOpenWorkId(parsed);
        }
    }, [searchParams]);

    return (
        <main className="min-h-screen selection:bg-brand-blue selection:text-white bg-brand-bg relative pb-40">
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
            />

            {/* Project detail modal - same component the home page uses */}
            <WorkDetailOverlay workId={openWorkId} onClose={() => setOpenWorkId(null)} />
        </main>
    );
}
