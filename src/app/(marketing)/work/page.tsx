"use client";

import { useState } from "react";
import { WorkHero, WorkGallery } from "@/components/marketing";
import { WorkDetailOverlay } from "@/components/marketing/WorkDetailOverlay";

export default function WorkPage() {
    const [activeCategory, setActiveCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [openWorkId, setOpenWorkId] = useState<number | null>(null);

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
                onProjectClick={(id) => {
                    const n = Number(id);
                    if (!Number.isNaN(n)) setOpenWorkId(n);
                }}
            />

            <WorkDetailOverlay workId={openWorkId} onClose={() => setOpenWorkId(null)} />
        </main>
    );
}
