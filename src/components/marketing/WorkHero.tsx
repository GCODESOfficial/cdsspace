"use client";

import { motion } from "framer-motion";
import { useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WorkHero Component - 1:1 Figma Implementation
 * Node IDs: 6003:8493, 6016:1551, 6016:7646
 */

import { CATEGORY_FILTERS } from "./WorkGallery";

const categories = CATEGORY_FILTERS.map(({ id, label }) => ({ id, label }));

interface WorkHeroProps {
    activeCategory: string;
    onCategoryChange: (id: string) => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
}

export const WorkHero = ({ activeCategory, onCategoryChange, searchQuery, onSearchChange }: WorkHeroProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const didInitialScroll = useRef(false);

    // Keep the active pill visible when the user changes category. Skip the
    // first render so the row starts at the left edge regardless of which
    // category happens to be selected on mount.
    useEffect(() => {
        if (!didInitialScroll.current) {
            didInitialScroll.current = true;
            if (scrollRef.current) scrollRef.current.scrollLeft = 0;
            return;
        }
        const activeElement = scrollRef.current?.querySelector(`[data-category="${activeCategory}"]`);
        if (activeElement) {
            activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [activeCategory]);

    return (
        <section className="relative w-full bg-brand-bg pt-[104px] overflow-hidden">
            {/* 
                Refined Width: The Hero framing (Node 6003:8493) is 1005px wide in Figma.
                The inner headline (Node 6016:1553) is 784px.
                This makes it narrower than the Navbar (1240px).
                
            */}

            <div className="max-w-full mx-auto flex flex-col items-center border-t border-brand-stroke-ii">
                <div className="w-full max-w-[850px] xl:max-w-[1005px] border-l border-r border-[#c8d1e0] border-solid flex flex-col items-center pt-[104px] relative">
                    {/* 1. Headline Section - Node 6016:1551 */}
                    <div className="flex flex-col items-center justify-center text-center px-6 pb-[48px] max-w-[800px] mx-auto" >
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[#4B5563] text-lg md:text-[20px] font-medium tracking-[-0.2px] mb-4"
                        >
                            Real projects. Real results.
                        </motion.p>
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-[40px] md:text-[56px] font-semibold leading-[1.24] tracking-[-1.12px] max-w-[784px] text-[#040B37]"
                        >
                            See what we&apos;ve built
                        </motion.h1>
                    </div>

                    {/* 2. Category Filter Bar — scrollable, starts at the first pill */}
                    <div className="relative w-full border-t border-dashed border-[#C8D1E0] z-40 bg-brand-bg/80 backdrop-blur-md">
                        <div
                            ref={scrollRef}
                            className="flex items-center gap-2 md:gap-[8px] px-6 py-[16px] overflow-x-auto no-scrollbar snap-x"
                        >
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    data-category={cat.id}
                                    onClick={() => onCategoryChange(cat.id)}
                                    className={cn(
                                        "shrink-0 px-[18px] xl:px-[24px] py-[8px] xl:py-[13px] rounded-[100px] text-[14px] xl:text-[18px] font-medium tracking-[-0.18px] transition-all duration-300 snap-start whitespace-nowrap cursor-pointer",
                                        activeCategory === cat.id
                                            ? "bg-[#4B5563] text-white shadow-[0px_2px_4px_0px_rgba(75,85,99,0.3)] border-2 border-white"
                                            : "bg-transparent text-[#4B5563] border border-[#E3E8F4] hover:border-[#4B5563]/30"
                                    )}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Fade edges to hint at overflow */}
                        <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-brand-bg to-transparent pointer-events-none" />
                        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-brand-bg to-transparent pointer-events-none" />
                    </div>

                    {/* 3. Search bar — full-frame width, filters title & category */}
                    <div className="w-full border-t border-dashed border-[#C8D1E0] bg-brand-bg/60 backdrop-blur-md">
                        <div className="flex items-center gap-3 px-6 py-[14px]">
                            <Search className="w-[18px] h-[18px] text-brand-mute shrink-0" strokeWidth={2} />
                            <input
                                value={searchQuery}
                                onChange={(e) => onSearchChange(e.target.value)}
                                placeholder="Search projects or categories..."
                                aria-label="Search works"
                                className="flex-1 min-w-0 bg-transparent outline-none text-[14px] md:text-[15px] xl:text-[16px] text-brand-navy placeholder:text-brand-mute font-medium"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => onSearchChange("")}
                                    aria-label="Clear search"
                                    className="shrink-0 p-1 rounded-full text-brand-mute hover:text-brand-navy hover:bg-brand-stroke/40 transition"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
