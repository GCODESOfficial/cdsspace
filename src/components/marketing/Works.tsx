"use client";

import { SectionHeader } from "@/components/shared/SectionHeader";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowUpRight } from "lucide-react";
import { WorkDetailOverlay } from "./WorkDetailOverlay";
import {
    getWorkCoverShape,
    type WorkCoverShape,
} from "./work-cover-layout";
import { WorkMosaicItem } from "./WorkMosaicItem";

interface Work {
    id: number;
    title: string;
    category: string | null;
    cover_image: string | null;
    created_at: string;
}

export const Works = () => {
    const [works, setWorks] = useState<Work[]>([]);
    const [loading, setLoading] = useState(true);
    const [openWorkId, setOpenWorkId] = useState<number | null>(null);
    const [coverShapes, setCoverShapes] = useState<Record<number, WorkCoverShape>>({});

    useEffect(() => {
        let cancelled = false;

        (async () => {
            // Show the works the admin curated as "Featured" - stored in the
            // `brands` table (selected = true, name = work title, ordered).
            // Falls back to the most-recent uploads only when nothing has been
            // featured yet, so the section is never empty.
            const { data: featuredRows } = await supabase
                .from("brands")
                .select("name, order")
                .eq("selected", true)
                .order("order", { ascending: true });

            let result: Work[] = [];
            const titles = (featuredRows ?? []).map((b: { name: string }) => b.name);

            if (titles.length > 0) {
                const { data: matching } = await supabase
                    .from("works")
                    .select("id, title, category, cover_image, created_at")
                    .in("title", titles);

                const byTitle = new Map<string, Work>(
                    ((matching as Work[]) ?? []).map((w) => [w.title, w]),
                );
                // Preserve the admin-defined featured order.
                result = titles
                    .map((t: string) => byTitle.get(t))
                    .filter((w): w is Work => Boolean(w));
            }

            if (result.length === 0) {
                const { data } = await supabase
                    .from("works")
                    .select("id, title, category, cover_image, created_at")
                    .order("created_at", { ascending: false })
                    .limit(6);
                result = (data as Work[]) ?? [];
            }

            if (cancelled) return;
            setWorks(result);
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const mainGridProjects = works.slice(0, 8);

    return (
        <section className="py-16 md:py-24 lg:py-32 bg-brand-bg" id="works">
            <div className="section-container">
                <SectionHeader
                    badge="Real projects. Real results."
                    title="See what we’ve built"
                    className="mb-12 md:mb-16"
                />

                <div className="max-w-[1240px] mx-auto px-5 lg:px-0">
                    {loading ? (
                        <WorksSkeleton />
                    ) : works.length === 0 ? (
                        <EmptyState />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 auto-rows-[4px] gap-0 grid-flow-dense mb-6 overflow-hidden rounded-[10px] border border-brand-stroke/60 bg-[#050713]">
                                {mainGridProjects.map((work, idx) => {
                                    const shape = coverShapes[work.id];

                                    return (
                                        <WorkMosaicItem key={work.id} shape={shape} gap={0} rowHeight={4} minRowSpan={42}>
                                            <WorkCard
                                                work={work}
                                                index={idx}
                                                shape={shape}
                                                onImageShape={(nextShape) =>
                                                    setCoverShapes((prev) => ({ ...prev, [work.id]: nextShape }))
                                                }
                                                onOpen={() => setOpenWorkId(work.id)}
                                            />
                                        </WorkMosaicItem>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* Project detail modal */}
                    <WorkDetailOverlay workId={openWorkId} onClose={() => setOpenWorkId(null)} />

                    {/* CTA Button */}
                    <div className="mt-16 flex justify-center">
                        <Link href="/work">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="px-10 py-4 md:px-12 md:py-5 rounded-full text-white font-medium text-lg relative overflow-hidden group shadow-xl cursor-pointer"
                                style={{
                                    backgroundImage:
                                        "linear-gradient(146.28deg, #0035C1 8.83%, #0575FF 86.3%)",
                                }}
                            >
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                <span className="relative z-10">View all work</span>
                            </motion.button>
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
};

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */

function WorkCard({
    work,
    index,
    onOpen,
    shape,
    onImageShape,
}: {
    work: Work;
    index: number;
    onOpen: () => void;
    shape?: WorkCoverShape | null;
    onImageShape?: (shape: WorkCoverShape) => void;
}) {
    const [localShape, setLocalShape] = useState<WorkCoverShape | null>(null);
    const [imageFailed, setImageFailed] = useState(false);
    const effectiveShape = shape ?? localShape;

    const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const nextShape = getWorkCoverShape(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
        if (!nextShape) return;
        setLocalShape(nextShape);
        onImageShape?.(nextShape);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            viewport={{ once: true }}
            className="h-full"
        >
            <button
                type="button"
                onClick={onOpen}
                aria-label={`Open ${work.title}`}
                className="relative block h-full w-full text-left overflow-hidden group bg-[#050713] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
            >
                {work.cover_image && !imageFailed ? (
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
                        onError={() => setImageFailed(true)}
                        className="object-cover transform transition-transform duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 bg-[#050713]">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(28,78,209,0.22),transparent_38%)]" />
                    </div>
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
}

/* ------------------------------------------------------------------ */
/*  States                                                             */
/* ------------------------------------------------------------------ */

function WorksSkeleton() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 auto-rows-[4px] gap-0 grid-flow-dense mb-6 overflow-hidden rounded-[10px] border border-brand-stroke/60">
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className={`bg-brand-stroke/30 animate-pulse ${
                        i % 5 === 0 ? "md:col-span-2 [grid-row-end:span_48]" : "[grid-row-end:span_56]"
                    }`}
                />
            ))}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="rounded-[24px] border border-dashed border-brand-stroke/70 bg-white/50 py-20 px-6 text-center">
            <p className="text-brand-body font-medium">
                No works have been uploaded yet.
            </p>
            <p className="text-brand-mute text-sm mt-1">
                Check back soon - we’re publishing new projects.
            </p>
        </div>
    );
}
