"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WorkHero, WorkGallery } from "@/components/marketing";
import { WorkDetailOverlay } from "@/components/marketing/WorkDetailOverlay";

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

            {/* Project detail modal — same component the home page uses */}
            <WorkDetailOverlay workId={openWorkId} onClose={() => setOpenWorkId(null)} />
        </main>
    );
}
