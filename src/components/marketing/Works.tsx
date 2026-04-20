"use client";

import { SectionHeader } from "@/components/shared/SectionHeader";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowUpRight } from "lucide-react";
import { WorkDetailOverlay } from "./WorkDetailOverlay";

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

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const { data, error } = await supabase
                .from("works")
                .select("id, title, category, cover_image, created_at")
                .order("created_at", { ascending: false })
                .limit(8);

            if (cancelled) return;
            if (!error && data) setWorks(data as Work[]);
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const mainGridProjects = works.slice(0, 6);
    // Only works with a cover image qualify for the landscape hero row —
    // otherwise a missing image renders as an empty panel next to a loaded one.
    const heroProjects = works.slice(6, 8).filter((w) => !!w.cover_image);

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
                            {/* Main portrait grid (indices 0–5) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                                {mainGridProjects.map((work, idx) => (
                                    <WorkCard
                                        key={work.id}
                                        work={work}
                                        index={idx}
                                        onOpen={() => setOpenWorkId(work.id)}
                                    />
                                ))}
                            </div>

                            {/* Landscape hero block (indices 6 & 7) */}
                            {heroProjects.length > 0 && (
                                <HeroRow works={heroProjects} onOpen={setOpenWorkId} />
                            )}
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

function WorkCard({ work, index, onOpen }: { work: Work; index: number; onOpen: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            viewport={{ once: true }}
        >
            <button
                type="button"
                onClick={onOpen}
                aria-label={`Open ${work.title}`}
                className="relative block w-full text-left rounded-[24px] md:rounded-[32px] overflow-hidden group aspect-4/5 border border-brand-stroke/40 bg-brand-stroke/20 cursor-pointer"
            >
                {work.cover_image ? (
                    <Image
                        src={work.cover_image}
                        alt={work.title}
                        fill
                        sizes="(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw"
                        className="object-cover transform transition-transform duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 bg-brand-stroke/30" />
                )}

                {/* Hover overlay — image alone at rest, dim + text on hover */}
                <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10 opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <h3 className="text-white text-[22px] md:text-[24px] font-bold tracking-tight drop-shadow-md">
                        {work.title}
                    </h3>
                    {work.category && (
                        <p className="mt-1 text-white/85 text-[13px] md:text-[14px] font-medium drop-shadow">
                            {work.category}
                        </p>
                    )}

                    <div className="mt-5 w-11 h-11 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
                        <ArrowUpRight className="w-5 h-5 text-[#0035C1]" strokeWidth={2.4} />
                    </div>
                </div>
            </button>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Landscape hero row (items 7 & 8)                                   */
/* ------------------------------------------------------------------ */

function HeroRow({ works, onOpen }: { works: Work[]; onOpen: (id: number) => void }) {
    const hasSecond = !!works[1];
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
            className="relative h-[320px] md:h-[480px] rounded-[24px] md:rounded-[32px] overflow-hidden bg-brand-bg border border-brand-stroke"
        >
            <div className="flex w-full h-full relative">
                <HeroHalf
                    work={works[0]}
                    align={hasSecond ? "left" : "center"}
                    onOpen={() => onOpen(works[0].id)}
                />
                {hasSecond && (
                    <div className="hidden md:block relative flex-1 h-full">
                        <HeroHalf work={works[1]} align="right" onOpen={() => onOpen(works[1].id)} />
                    </div>
                )}

                {/* Fade/ellipse transition — only when we actually have two halves */}
                {hasSecond && (
                    <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-[120%] z-20 pointer-events-none">
                        <div className="w-full h-full bg-linear-to-r from-transparent via-[#121212] to-transparent blur-[25px]" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-64 bg-[#121212] blur-[50px] rounded-full" />
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function HeroHalf({ work, align, onOpen }: { work: Work; align: "left" | "right" | "center"; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${work.title}`}
            className="relative flex-1 h-full block group text-left cursor-pointer"
        >
            {work.cover_image && (
                <Image
                    src={work.cover_image}
                    alt={work.title}
                    fill
                    sizes={align === "center" ? "100vw" : "(min-width: 768px) 50vw, 100vw"}
                    className={cn(
                        "object-cover transform transition-transform duration-700 group-hover:scale-[1.03]",
                        align === "left" ? "object-right" : align === "right" ? "object-left" : "object-center"
                    )}
                />
            )}
            <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="absolute bottom-6 left-6 right-6 z-10 flex items-end justify-between gap-4 opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                <div className="min-w-0">
                    <h3 className="text-white text-[22px] md:text-[26px] font-bold tracking-tight truncate drop-shadow-md">
                        {work.title}
                    </h3>
                    {work.category && (
                        <p className="text-white/85 text-[13px] md:text-[14px] font-medium drop-shadow">
                            {work.category}
                        </p>
                    )}
                </div>
                <div className="shrink-0 w-11 h-11 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
                    <ArrowUpRight className="w-5 h-5 text-[#0035C1]" strokeWidth={2.4} />
                </div>
            </div>
        </button>
    );
}

/* ------------------------------------------------------------------ */
/*  States                                                             */
/* ------------------------------------------------------------------ */

function WorksSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-[24px] md:rounded-[32px] aspect-4/5 bg-brand-stroke/30 animate-pulse"
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
                Check back soon — we’re publishing new projects.
            </p>
        </div>
    );
}
