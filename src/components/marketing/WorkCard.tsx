"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Work {
    id: number;
    title: string;
    category: string | null;
    cover_image: string | null;
    created_at: string;
}

interface WorkCardProps {
    work: Work;
    index?: number;
    onOpen: (id: number) => void;
    className?: string;
}

/**
 * Premium Work Card component used in the home page grid and the work gallery.
 * Features a hover overlay with animated content and a refined design.
 */
export function WorkCard({ work, index = 0, onOpen, className }: WorkCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            viewport={{ once: true }}
            className={cn("h-full", className)}
        >
            <button
                type="button"
                onClick={() => onOpen(work.id)}
                aria-label={`Open ${work.title}`}
                className="relative block w-full h-full text-left rounded-[24px] md:rounded-[32px] 2xl:rounded-[40px] overflow-hidden group border border-brand-stroke/40 bg-brand-stroke/20 cursor-pointer shadow-sm hover:shadow-xl transition-shadow duration-500"
            >
                {/* Mobile-only pill with category (Always visible on mobile) */}
                {work.category && (
                    <div className="absolute top-6 left-6 z-20 md:hidden max-w-[calc(100%-92px)]">
                        <div className="bg-white/20 backdrop-blur-md border border-white/30 px-3 py-1 rounded-full">
                            <span className="text-white text-[12px] font-semibold tracking-wide uppercase truncate block">
                                {work.category}
                            </span>
                        </div>
                    </div>
                )}

                {/* Mobile-only arrow (Always visible on mobile) */}
                <div className="absolute top-6 right-6 z-20 md:hidden">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg">
                        <ArrowUpRight className="w-5 h-5 text-[#0035C1]" strokeWidth={2.4} />
                    </div>
                </div>

                {work.cover_image ? (
                    <Image
                        src={work.cover_image}
                        alt={work.title}
                        fill
                        quality={90}
                        sizes="(min-width: 1024px) 480px, (min-width: 768px) 50vw, 100vw"
                        className="object-cover transform transition-transform duration-1000 ease-out group-hover:scale-110"
                    />
                ) : (
                    <div className="absolute inset-0 bg-brand-stroke/30" />
                )}

                {/* Premium Hover Overlay - Desktop Only */}
                <div className="absolute inset-0 bg-brand-navy/60 md:bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 ease-out hidden md:flex">
                    <h3 className="text-white text-[24px] md:text-[28px] font-bold tracking-tight drop-shadow-lg leading-tight">
                        {work.title}
                    </h3>
                    {work.category && (
                        <p className="mt-2 text-white/90 text-[14px] md:text-[15px] font-medium drop-shadow-md">
                            {work.category}
                        </p>
                    )}

                    <div className="mt-6 w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-500 delay-100">
                        <ArrowUpRight className="w-6 h-6 text-[#0035C1]" strokeWidth={2.5} />
                    </div>
                </div>
            </button>
        </motion.div>
    );
}
