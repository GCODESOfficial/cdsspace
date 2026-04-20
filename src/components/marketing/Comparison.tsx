"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * 1:1 Figma Implementation of the Comparison Section
 * Uses CSS Grid for perfect vertical alignment and fluid scaling for smaller desktops.
 * Node ID: 5757:935
 */

interface ComparisonRow {
    feature: string;
    cds: boolean;
    fullTime: boolean;
    otherAgency: boolean;
}

const comparisonData: ComparisonRow[] = [
    { feature: "Retainership", cds: true, fullTime: true, otherAgency: true },
    { feature: "Pause or cancel anytime", cds: true, fullTime: false, otherAgency: true },
    { feature: "36-hour average delivery", cds: true, fullTime: false, otherAgency: false },
    { feature: "Unlimited requests & revisions", cds: true, fullTime: true, otherAgency: false },
    { feature: "Access to design file", cds: true, fullTime: true, otherAgency: false },
];

const StatusIcon = ({ active }: { active: boolean }) => (
    <div className="flex items-center justify-center">
        <Image
            src={active ? "/home/checkmark-circle-02.svg" : "/home/cancel-circle.svg"}
            alt={active ? "Included" : "Not included"}
            width={28}
            height={28}
            className="w-6 h-6 md:w-[28px] md:h-[28px] shrink-0"
        />
    </div>
);

export const Comparison = () => {
    // Grid configuration shared between header and body
    const gridClassName = "grid grid-cols-[200px_repeat(3,140px)] md:grid-cols-[283px_repeat(3,1fr)] items-center";

    return (
        <section className="w-full py-16 md:py-24 lg:py-32 bg-brand-bg overflow-hidden px-4 md:px-6 lg:px-10" id="why-us">
            <div className="w-full max-w-[1109px] mx-auto flex flex-col items-center">

                {/* Section Header */}
                <div className="flex flex-col items-center text-center max-w-[784px] mb-12 md:mb-[52px]">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-[clamp(32px,4vw,48px)] font-semibold text-brand-navy leading-[1.24] tracking-[-0.96px] mb-4"
                    >
                        Why teams choose us?
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-[clamp(16px,1.5vw,18px)] font-medium text-brand-body tracking-[-0.18px] max-w-[640px]"
                    >
                        More than you expect. Exactly what you need.
                    </motion.p>
                </div>

                {/* Table Container with Horizontal Scroll fallback */}
                <div className="w-full overflow-x-auto scrollbar-hide pb-4 lg:px-20 xl:px-0">
                    <div className="min-w-[700px] flex flex-col">

                        {/* Table Header Row */}
                        <div className={cn(
                            gridClassName,
                            "bg-white rounded-t-[16px] px-6 md:px-10 py-6 border border-brand-stroke-ii/30 relative z-10"
                        )}>
                            <div className="sticky left-0 bg-white z-20">
                                <span className="text-[clamp(14px,1.5vw,18px)] font-semibold text-brand-navy tracking-[-0.18px]">
                                    Features
                                </span>
                            </div>

                            <div className="flex justify-center px-4">
                                <Image
                                    src="/navbar/CDS Logo.svg"
                                    alt="CDS Logo"
                                    width={56}
                                    height={22}
                                    className="h-[18px] md:h-[22px] w-auto"
                                />
                            </div>

                            <div className="text-center px-4">
                                <span className="text-[clamp(14px,1.5vw,18px)] font-semibold text-brand-navy tracking-[-0.18px]">
                                    Full-time Designer
                                </span>
                            </div>

                            <div className="text-center px-4">
                                <span className="text-[clamp(14px,1.5vw,18px)] font-semibold text-brand-navy tracking-[-0.18px]">
                                    Other Agency
                                </span>
                            </div>
                        </div>

                        {/* Table Body Content */}
                        <div className="relative rounded-b-[16px] overflow-hidden bg-white/10 backdrop-blur-sm pt-3">
                            {/* Outer Pulsing Dashed Border Bounding Box */}
                            <motion.div
                                animate={{ opacity: [0.3, 0.8, 0.3] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                className="absolute inset-0 pointer-events-none rounded-b-[16px]"
                                style={{
                                    // Custom dashed borders for Left, Right, and Bottom
                                    padding: '1px',
                                    backgroundImage: `
                                        linear-gradient(to right, #C8D1E0 90%, transparent 90%),
                                        linear-gradient(to right, #C8D1E0 90%, transparent 90%),
                                        linear-gradient(to bottom, #C8D1E0 90%, transparent 90%),
                                        linear-gradient(to bottom, #C8D1E0 90%, transparent 90%)
                                    `,
                                    backgroundPosition: `
                                        0 100%,
                                        0 0,
                                        0 0,
                                        100% 0
                                    `,
                                    backgroundSize: `
                                        24px 1px,
                                        24px 1px,
                                        1px 24px,
                                        1px 24px
                                    `,
                                    backgroundRepeat: 'repeat-x, repeat-x, repeat-y, repeat-y'
                                }}
                            />

                            {comparisonData.map((row, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                                    className={cn(
                                        gridClassName,
                                        "px-6 md:px-10 py-5 md:py-7 relative group transition-colors duration-300 hover:bg-white/40"
                                    )}
                                >
                                    {/* Feature Name - Sticky on mobile scroll */}
                                    <div className="sticky left-0 bg-transparent py-2 z-10">
                                        <span className="text-[clamp(14px,1.5vw,18px)] font-medium text-brand-body tracking-[-0.18px] leading-snug">
                                            {row.feature}
                                        </span>
                                    </div>

                                    {/* Vertical Dividers Recreated using border-l on cells */}
                                    <div className="h-full border-l border-brand-stroke-ii px-4 md:px-8">
                                        <StatusIcon active={row.cds} />
                                    </div>

                                    <div className="h-full border-l border-brand-stroke-ii px-4 md:px-8">
                                        <StatusIcon active={row.fullTime} />
                                    </div>

                                    <div className="h-full border-l border-brand-stroke-ii px-4 md:px-8">
                                        <StatusIcon active={row.otherAgency} />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
