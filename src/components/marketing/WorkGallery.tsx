"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Category filter -> Supabase category name.
 * "all" means no filter. Other values must match `works.category` exactly,
 * which comes from the dropdown in /admin/upload-works (populated from
 * CATEGORIES in @/lib/constants).
 */
export const CATEGORY_FILTERS: { id: string; label: string; dbName: string | null }[] = [
    { id: "all", label: "All", dbName: null },
    { id: "brand-identity", label: "Brand Identity", dbName: "Brand Identity Development" },
    { id: "web3-branding", label: "Web3 Branding", dbName: "Web3 Branding & Product Development" },
    { id: "event-branding", label: "Event Branding", dbName: "Event Branding & Print Logistics" },
    { id: "merch-pack", label: "Merch & Pack", dbName: "Merch Design & Packaging" },
    { id: "ui-ux", label: "UI/UX Design", dbName: "UX/UI Design & Website Development" },
    { id: "3d-modeling", label: "3D Modeling", dbName: "3D Modeling (AR & VR)" },
    { id: "corporate-documents", label: "Corporate Documents", dbName: "Corporate Documents" },
];

export interface Work {
    id: number;
    title: string;
    category: string | null;
    cover_image: string | null;
    created_at: string;
}

/**
 * Remove repeats. Two rows with the same title (case-insensitive, trimmed)
 * are treated as duplicates; the most recent row wins because we fetch in
 * descending created_at order.
 */
function dedupeWorks(rows: Work[]): Work[] {
    const seen = new Set<string>();
    const unique: Work[] = [];
    for (const row of rows) {
        const key = (row.title ?? "").trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(row);
    }
    return unique;
}

interface WorkGalleryProps {
    activeCategory: string;
    searchQuery?: string;
    onOpen: (id: number) => void;
}

export const WorkGallery = ({ activeCategory, searchQuery = "", onOpen }: WorkGalleryProps) => {
    const [works, setWorks] = useState<Work[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const { data, error } = await supabase
                .from("works")
                .select("id, title, category, cover_image, created_at")
                .order("created_at", { ascending: false });

            if (cancelled) return;
            if (error || !data) {
                setWorks([]);
            } else {
                setWorks(dedupeWorks(data as Work[]));
            }
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const activeFilter = CATEGORY_FILTERS.find((c) => c.id === activeCategory);
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = works.filter((w) => {
        if (activeFilter?.dbName && w.category !== activeFilter.dbName) return false;
        if (normalizedQuery) {
            const haystack = `${w.title ?? ""} ${w.category ?? ""}`.toLowerCase();
            if (!haystack.includes(normalizedQuery)) return false;
        }
        return true;
    });

    return (
        <section className="bg-brand-bg">
            <div className="max-w-[1408px] mx-auto px-6">
                {loading ? (
                    <GallerySkeleton />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        isFiltered={Boolean(activeFilter?.dbName) || normalizedQuery.length > 0}
                        query={normalizedQuery}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px]">
                        {filtered.map((work) => (
                            <div key={work.id} className="h-[504px]">
                                <ProjectCard
                                    work={work}
                                    onClick={() => onOpen(work.id)}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export const ProjectCard = ({
    work,
    onClick,
    className,
}: {
    work: Work;
    onClick: () => void;
    className?: string;
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn("relative h-full", className)}
        >
            <button
                type="button"
                onClick={onClick}
                aria-label={`Open ${work.title}`}
                className="relative block w-full h-full text-left rounded-[24px] lg:rounded-[12px] 2xl:rounded-[24px] overflow-hidden group border border-[#E3E8F4] cursor-pointer bg-brand-stroke/20"
            >
                {/* Mobile pill with category */}
                {work.category && (
                    <div className="absolute top-6 left-6 z-20 md:hidden max-w-[calc(100%-92px)]">
                        <div className="bg-white/20 backdrop-blur-md border border-white/30 px-3 py-1 rounded-full">
                            <span className="text-white text-[12px] font-semibold tracking-wide uppercase truncate block">
                                {work.category}
                            </span>
                        </div>
                    </div>
                )}

                <div className="absolute top-6 right-6 z-20 md:hidden">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg">
                        <ArrowUpRight className="w-5 h-5 text-[#0035C1]" strokeWidth={2.4} />
                    </div>
                </div>

                {/* Cover image */}
                {work.cover_image ? (
                    <Image
                        src={work.cover_image}
                        alt={work.title}
                        fill
                        sizes="(min-width: 1024px) 480px, (min-width: 768px) 50vw, 100vw"
                        className="object-cover transform transition-transform duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 bg-brand-stroke/30" />
                )}

                {/* Desktop hover overlay — title + category + arrow, image-only at rest */}
                <div className="absolute inset-0 bg-brand-navy/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden md:flex flex-col items-center justify-center text-center p-8 pointer-events-none">
                    <h3 className="text-white text-2xl font-bold mb-2 tracking-tight">{work.title}</h3>
                    {work.category && (
                        <p className="text-white/85 text-[15px] font-medium">{work.category}</p>
                    )}
                    <div className="mt-6 w-12 h-12 rounded-full border border-white flex items-center justify-center">
                        <ArrowUpRight size={24} strokeWidth={2} className="text-white" />
                    </div>
                </div>
            </button>
        </motion.div>
    );
};

/* ------------------------------------------------------------------ */
/*  States                                                             */
/* ------------------------------------------------------------------ */

function GallerySkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px]">
            {Array.from({ length: 9 }).map((_, i) => (
                <div
                    key={i}
                    className="h-[504px] rounded-[24px] bg-brand-stroke/30 animate-pulse"
                />
            ))}
        </div>
    );
}

function EmptyState({ isFiltered, query }: { isFiltered: boolean; query: string }) {
    return (
        <div className="rounded-[24px] border border-dashed border-brand-stroke/70 bg-white/50 py-20 px-6 text-center">
            <p className="text-brand-body font-medium">
                {query
                    ? `No works match “${query}”.`
                    : isFiltered
                      ? "No works in this category yet."
                      : "No works have been uploaded yet."}
            </p>
            <p className="text-brand-mute text-sm mt-1">
                {isFiltered || query
                    ? "Try a different term or filter."
                    : "Check back soon — we’re publishing new projects."}
            </p>
        </div>
    );
}
