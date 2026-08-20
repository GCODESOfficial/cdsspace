"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Footer } from "../layout/Footer";
import { ProjectCard, type Work } from "./WorkGallery";
import { supabase } from "@/lib/supabase";

/**
 * ARCHITECTURAL NOTE:
 * This component implements a the "Mosaic Meta" layout system.
 * It follows a strict 1:1 rhythm: [FULL] -> [TRIO] -> [SPLIT] -> [FULL] -> [SPLIT] -> [TRIO] -> [FULL]
 * It prioritizes object-contain for packaging assets to avoid cropping.
 */

export interface Testimonial {
    quote: string;
    author: string;
    role: string;
    image: string;
}

export interface ProjectDetail {
    id: string;
    brand: string;
    description: string;
    year: string;
    scope: string;
    status?: string;
    images: string[];
    testimonial?: Testimonial;
}

export type LayoutBlock =
    | { type: 'FULL'; src: string }
    | { type: 'SPLIT'; srcs: [string, string] }
    | { type: 'TRIO'; srcs: [string, string, string] };

/**
 * Utility: Heuristic Pattern Engine
 * Maps a flat image array into the specific Figma mosaic pattern.
 */
const generateMosaicRhythm = (images: string[]): LayoutBlock[] => {
    if (!images || images.length === 0) return [];

    const blocks: LayoutBlock[] = [];
    const pattern: Array<'FULL' | 'TRIO' | 'SPLIT'> = ['FULL', 'TRIO', 'SPLIT', 'FULL', 'SPLIT', 'TRIO', 'FULL'];

    let imageIdx = 0;
    let patternIdx = 0;

    while (imageIdx < images.length) {
        const type = pattern[patternIdx % pattern.length];
        const remaining = images.length - imageIdx;

        if (type === 'TRIO' && remaining >= 3) {
            blocks.push({ type: 'TRIO', srcs: [images[imageIdx], images[imageIdx + 1], images[imageIdx + 2]] as [string, string, string] });
            imageIdx += 3;
        } else if (type === 'SPLIT' && remaining >= 2) {
            blocks.push({ type: 'SPLIT', srcs: [images[imageIdx], images[imageIdx + 1]] as [string, string] });
            imageIdx += 2;
        } else {
            blocks.push({ type: 'FULL', src: images[imageIdx] });
            imageIdx += 1;
        }
        patternIdx++;
    }

    return blocks;
};

interface ProjectDetailOverlayProps {
    project: ProjectDetail | null;
    onClose: () => void;
    onProjectClick?: (id: string) => void;
}

export const ProjectDetailOverlay = ({ project, onClose, onProjectClick }: ProjectDetailOverlayProps) => {
    const layout = useMemo(() => (project ? generateMosaicRhythm(project.images) : []), [project]);

    // Fetch other works from the DB to show in the "Explore more works" grid.
    const [relatedWorks, setRelatedWorks] = useState<Work[]>([]);
    useEffect(() => {
        if (!project) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from("works")
                .select("id, title, category, cover_image, created_at")
                .order("created_at", { ascending: false })
                .limit(20);
            if (cancelled || !data) return;
            // Dedupe by title (case-insensitive), keep the most recent row
            const seen = new Set<string>();
            const unique = (data as Work[]).filter((w) => {
                const key = (w.title ?? "").trim().toLowerCase();
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            // Exclude the currently-open project by brand-name match
            const currentBrand = project.brand.trim().toLowerCase();
            setRelatedWorks(
                unique.filter((w) => (w.title ?? "").trim().toLowerCase() !== currentBrand).slice(0, 4)
            );
        })();
        return () => {
            cancelled = true;
        };
    }, [project]);

    useEffect(() => {
        if (project) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [project]);

    return (
        <AnimatePresence>
            {project && (
                <motion.div
                    initial={{ opacity: 0, y: "100%" }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: "100%" }}
                    transition={{ type: "spring", damping: 30, stiffness: 150 }}
                    id="project-overlay-container"
                    className="fixed inset-0 z-[100] bg-brand-bg flex flex-col overflow-y-auto premium-scrollbar"
                    role="dialog"
                    aria-modal="true"
                >
                    {/* 1. Header Navigation - 1:1 Design (Node 6037:1473) */}
                    <div className="sticky top-0 z-50 w-full bg-[#F4F6FB] border-b border-[#C8D1E0] h-[118px] px-24">
                        <div className="max-w-[1232px] mx-auto h-full border-l border-r border-dashed border-[#C8D1E0] flex items-center justify-between px-4 md:px-8 py-4">
                            <div className="flex flex-col gap-2">
                                <h2 className="text-[#040B37] text-[20px] md:text-[24px] font-semibold tracking-[-0.96px] leading-[1.24]">
                                    {project.brand}
                                </h2>
                                {project.status && (
                                    <div className="w-fit bg-[#D5FFE4] rounded-full px-[18px] py-[6px] flex items-center justify-center translate-y-[-2px]">
                                        <span className="text-[#16A34A] text-[14px] md:text-[16px] font-medium tracking-[-0.16px]">
                                            {project.status === "Live Project" ? "Completed" : project.status}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={onClose}
                                className="bg-[#E3E8F4] border-2 border-white rounded-full px-4 md:px-[24px] py-2 md:py-[12px] flex items-center gap-2 text-[#4B5563] transition-all hover:bg-[#D1D9E9] group shadow-sm cursor-pointer"
                            >
                                <span className="hidden sm:inline text-[16px] md:text-[18px] font-medium tracking-[-0.18px]">Close</span>
                                <div className="relative w-5 h-5 md:w-6 md:h-6 flex items-center justify-center">
                                    <X size={20} className="md:w-6 md:h-6 group-hover:rotate-90 transition-transform duration-300" />
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="w-full max-w-[1408px] mx-auto pt-16 pb-32 px-6">

                        {/* 2. Metadata Section (Node 6027:11268 Pattern) */}
                        <div className="flex flex-col md:flex-row justify-between gap-12 mb-20 px-8 max-w-[1232px] mx-auto">
                            <div className="max-w-[840px]">
                                <h4 className="text-[#4B5563] text-sm font-semibold uppercase tracking-widest mb-4 opacity-60">About</h4>
                                <p className="text-[#4B5563] text-lg md:text-[22px] leading-[1.6] font-medium">
                                    {project.description}
                                </p>
                            </div>

                            <div className="flex flex-col gap-10 md:text-right">
                                <div>
                                    <h4 className="text-[#4B5563] text-sm font-semibold uppercase tracking-widest mb-2 opacity-60">Year</h4>
                                    <p className="text-[#040B37] text-lg md:text-xl font-bold">{project.year}</p>
                                </div>
                                <div>
                                    <h4 className="text-[#4B5563] text-sm font-semibold uppercase tracking-widest mb-2 opacity-60">Project Scope</h4>
                                    <p className="text-[#040B37] text-lg md:text-xl font-bold whitespace-pre-line">{project.scope}</p>
                                </div>
                            </div>
                        </div>

                        {/* 3. The Mosaic Rhythm Gallery */}
                        <div className="flex flex-col gap-4">
                            {layout.map((block, idx) => (
                                <LayoutSection key={idx} block={block} />
                            ))}
                        </div>

                        {/* 4. Explore more works - Replaces Testimonials */}
                        <div className="mt-40 max-w-[1232px] mx-auto">
                            <h3 className="text-[#040B37] text-2xl md:text-[32px] font-bold tracking-[-1px] mb-12 text-center md:text-left">
                                Explore more works
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {relatedWorks.map((relatedWork) => (
                                    <div key={relatedWork.id} className="h-[240px] md:h-[320px]">
                                        <ProjectCard
                                            work={relatedWork}
                                            onClick={() => {
                                                if (onProjectClick) {
                                                    onProjectClick(String(relatedWork.id));
                                                    const container = document.getElementById('project-overlay-container');
                                                    if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
                                                }
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <Footer />
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const LayoutSection = ({ block }: { block: LayoutBlock }) => {
    switch (block.type) {
        case 'FULL':
            return (
                <div data-cds-work-preview className="w-full relative rounded-[24px] overflow-hidden group">
                    <div className="aspect-[16/9] md:aspect-[2.5/1] relative w-full h-full">
                        <Image
                            src={block.src}
                            alt="Project showcase image"
                            fill
                            draggable={false}
                            className="object-contain p-4 md:p-0"
                            sizes="100vw"
                        />
                    </div>
                </div>
            );
        case 'SPLIT':
            return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    {block.srcs.map((src, i) => (
                        <div key={i} data-cds-work-preview className="aspect-696/540 relative rounded-[24px] overflow-hidden group">
                            <Image
                                src={src}
                                alt={`Project detail image ${i + 1}`}
                                fill
                                draggable={false}
                                className="object-contain transition-transform duration-700 group-hover:scale-105"
                                sizes="(max-width: 768px) 100vw, 50vw"
                            />
                        </div>
                    ))}
                </div>
            );
        case 'TRIO':
            return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                    {block.srcs.map((src, i) => (
                        <div key={i} data-cds-work-preview className="aspect-[458.67/539.71] relative rounded-[24px] overflow-hidden group">
                            <Image
                                src={src}
                                alt={`Project detail image ${i + 1}`}
                                fill
                                draggable={false}
                                className="object-contain transition-transform duration-700 group-hover:scale-105"
                                sizes="(max-width: 768px) 100vw, 33vw"
                            />
                        </div>
                    ))}
                </div>
            );
        default:
            return null;
    }
};
