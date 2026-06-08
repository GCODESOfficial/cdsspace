"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
    getWorkCoverShape,
    measureImage,
    type WorkCoverShape,
} from "./work-cover-layout";
import { WorkMosaicItem } from "./WorkMosaicItem";

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
    const [coverShapes, setCoverShapes] = useState<Record<number, WorkCoverShape>>({});

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

    useEffect(() => {
        let cancelled = false;

        works.forEach((work) => {
            if (!work.cover_image) return;

            measureImage(work.cover_image).then((shape) => {
                if (cancelled || !shape) return;
                setCoverShapes((prev) => (prev[work.id] ? prev : { ...prev, [work.id]: shape }));
            });
        });

        return () => {
            cancelled = true;
        };
    }, [works]);

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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 auto-rows-[1px] gap-4 grid-flow-dense">
                        {filtered.map((work) => {
                            const shape = coverShapes[work.id];

                            return (
                                <WorkMosaicItem key={work.id} shape={shape}>
                                    <ProjectCard
                                        work={work}
                                        shape={shape}
                                        onImageShape={(nextShape) =>
                                            setCoverShapes((prev) => ({ ...prev, [work.id]: nextShape }))
                                        }
                                        onClick={() => onOpen(work.id)}
                                    />
                                </WorkMosaicItem>
                            );
                        })}
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
    shape,
    onImageShape,
}: {
    work: Work;
    onClick: () => void;
    className?: string;
    shape?: WorkCoverShape | null;
    onImageShape?: (shape: WorkCoverShape) => void;
}) => {
    const [localShape, setLocalShape] = useState<WorkCoverShape | null>(null);
    const effectiveShape = shape ?? localShape;

    const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const nextShape = getWorkCoverShape(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
        if (!nextShape) return;
        setLocalShape(nextShape);
        onImageShape?.(nextShape);
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className={cn("relative h-full", className)}
        >
            <button
                type="button"
                onClick={onClick}
                aria-label={`Open ${work.title}`}
                className="relative block w-full h-full text-left rounded-[10px] overflow-hidden group border border-[#E3E8F4] cursor-pointer bg-[#050713] shadow-sm transition-shadow duration-500 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
            >
                {/* Cover image */}
                {work.cover_image ? (
                    <Image
                        src={work.cover_image}
                        alt={work.title}
                        fill
                        quality={92}
                        sizes={
                            effectiveShape?.kind === "wide"
                                ? "(min-width: 1536px) 700px, (min-width: 768px) 66vw, 100vw"
                                : "(min-width: 1536px) 360px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        }
                        onLoad={handleImageLoad}
                        className="object-cover transform transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 bg-brand-stroke/30" />
                )}

                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 group-focus-visible:bg-black/35 group-active:bg-black/35 transition-colors duration-300 pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/78 via-black/25 to-transparent opacity-0 transition-opacity duration-300 pointer-events-none group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100" />

                <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 text-white opacity-0 translate-y-3 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0 group-active:opacity-100 group-active:translate-y-0">
                    {work.category && (
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">
                            {work.category}
                        </p>
                    )}
                    <div className="flex items-end justify-between gap-4">
                        <h3 className="max-w-[calc(100%-56px)] text-[15px] md:text-[17px] font-medium leading-snug tracking-tight drop-shadow-md">
                            {work.title}
                        </h3>
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/80 bg-white/5 text-white opacity-100 md:opacity-0 md:translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                            <ArrowUpRight size={21} strokeWidth={2} />
                        </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 auto-rows-[1px] gap-4 grid-flow-dense">
            {Array.from({ length: 9 }).map((_, i) => (
                <div
                    key={i}
                    className={cn(
                        "rounded-[10px] bg-brand-stroke/30 animate-pulse",
                        i % 5 === 0 ? "md:col-span-2 [grid-row-end:span_17]" : "[grid-row-end:span_14]",
                    )}
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
