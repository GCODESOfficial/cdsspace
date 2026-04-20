"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { ImagePlus } from "lucide-react";

interface PortfolioDesign {
    id: string;
    title: string;
    image_url: string;
    category: string;
}

// Hardcoded fallback designs (used when no designs found for a category)
const fallbackDesigns: PortfolioDesign[] = [
    { id: "f1", title: "Blockchain Powerhouse", image_url: "/home/SafeAi Page-6.svg", category: "Blockchain" },
    { id: "f2", title: "Immune Booster", image_url: "/home/Immune Booster.svg", category: "Healthcare" },
    { id: "f3", title: "Modern Branding", image_url: "/work/Ad 02-.svg", category: "Other" },
    { id: "f4", title: "Creative Ad", image_url: "/work/Ad 05-.svg", category: "Other" },
];

interface PortfolioViewerProps {
    className?: string;
    selectedIndustry?: string;
}

export const PortfolioViewer = ({ className, selectedIndustry }: PortfolioViewerProps) => {
    const [designs, setDesigns] = useState<PortfolioDesign[]>(fallbackDesigns);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        async function fetchDesigns() {
            let query = supabase.from("portfolio_designs").select("*").order("created_at", { ascending: false });

            if (selectedIndustry) {
                query = query.eq("category", selectedIndustry);
            }

            const { data } = await query.limit(8);

            if (data && data.length > 0) {
                setDesigns(data);
                setActiveIndex(0);
            } else {
                // Fall back to all designs if none for this category
                const { data: allData } = await supabase
                    .from("portfolio_designs")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(8);

                if (allData && allData.length > 0) {
                    setDesigns(allData);
                } else {
                    setDesigns(fallbackDesigns);
                }
                setActiveIndex(0);
            }
        }
        fetchDesigns();
    }, [selectedIndustry]);

    // Auto-rotation
    useEffect(() => {
        if (designs.length <= 1) return;
        const interval = setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % designs.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [designs.length]);

    const activeDesign = designs[activeIndex];

    return (
        <div className={cn("flex flex-col gap-8", className)}>
            <div className="flex flex-col gap-2 text-center">
                <h3 className="text-brand-navy text-[20px] lg:text-[24px] font-semibold">Portfolio</h3>
                <p className="text-brand-body text-[14px] lg:text-[16px] font-medium tracking-tight">
                    {selectedIndustry ? `${selectedIndustry} designs` : "Tailored designs for unique business needs"}
                </p>
            </div>

            {/* Main Slideshow */}
            <div className="aspect-square lg:aspect-auto lg:h-[386px] bg-brand-bg rounded-2xl relative overflow-hidden group shadow-sm border border-brand-stroke/50">
                {activeDesign ? (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeDesign.id + activeIndex}
                            initial={{ opacity: 0, scale: 1.05 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute inset-0"
                        >
                            <Image
                                src={activeDesign.image_url}
                                alt={activeDesign.title}
                                fill
                                className="object-cover"
                            />
                        </motion.div>
                    </AnimatePresence>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <ImagePlus className="w-10 h-10 text-gray-300" />
                    </div>
                )}

                {/* Dots */}
                {designs.length > 1 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/10 backdrop-blur-md px-3 py-1.5 rounded-full z-10">
                        {designs.slice(0, 6).map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setActiveIndex(idx)}
                                className={cn(
                                    "h-2 transition-all duration-500 rounded-full cursor-pointer",
                                    activeIndex === idx ? "w-8 bg-brand-blue" : "w-2 bg-white/50 hover:bg-brand-blue/40"
                                )}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Grid Thumbnails */}
            {designs.length > 1 && (
                <div className="bg-brand-bg rounded-3xl p-4 lg:p-5 border border-brand-stroke/30">
                    <div className="grid grid-cols-2 gap-4">
                        {designs.slice(0, 4).map((design, idx) => (
                            <button
                                key={design.id}
                                onClick={() => setActiveIndex(idx)}
                                className={cn(
                                    "aspect-square bg-white border rounded-xl overflow-hidden transition-all duration-300 relative group cursor-pointer",
                                    activeIndex === idx
                                        ? "border-brand-blue ring-2 ring-brand-blue/10 scale-[1.02] shadow-lg"
                                        : "border-brand-stroke hover:border-brand-blue/30"
                                )}
                            >
                                <Image
                                    src={design.image_url}
                                    alt={design.title}
                                    fill
                                    className={cn(
                                        "object-cover transition-transform duration-500 group-hover:scale-110",
                                        activeIndex === idx ? "opacity-100" : "opacity-60 grayscale-[0.4] group-hover:grayscale-0 group-hover:opacity-100"
                                    )}
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
