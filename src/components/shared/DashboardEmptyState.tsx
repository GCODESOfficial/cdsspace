"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface DashboardEmptyStateProps {
    icon: string;
    title: string;
    description: string;
    buttonText: string;
    onButtonClick?: () => void;
    className?: string;
}

/**
 * DashboardEmptyState - A reusable component for dashboard empty states.
 * Implements hyper-responsive scaling for varying laptop screen sizes (e.g., 1239px)
 * to maintain 1:1 visual fidelity with the 1440px/1770px design intent.
 */
export const DashboardEmptyState = ({
    icon,
    title,
    description,
    buttonText,
    onButtonClick,
    className,
}: DashboardEmptyStateProps) => {
    return (
        <div className={cn("w-full h-full flex flex-col items-center justify-center py-12 lg:py-16 xl:py-20 px-6", className)}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center max-w-[940px] w-full text-center gap-[24px] lg:gap-[32px] xl:gap-[40px]"
            >
                {/* Visual Icon Container - Responsive sizing for exact design proportions */}
                <div className="w-[64px] lg:w-[96px] xl:w-[116px] h-[64px] lg:h-[96px] xl:h-[116px] bg-[#EDF0F6] rounded-full flex items-center justify-center shadow-inner relative overflow-hidden shrink-0">
                    <Image
                        src={icon}
                        alt={title}
                        width={40}
                        height={40}
                        className="opacity-50 w-8 h-8 lg:w-9 lg:h-9 xl:w-10 xl:h-10"
                    />
                </div>

                {/* Text Content - Fluid typography and scaling */}
                <div className="flex flex-col gap-[8px]">
                    <h2 className="text-brand-body text-[14px] lg:text-[20px] xl:text-[24px] font-semibold leading-tight">
                        {title}
                    </h2>
                    <p className="text-brand-mute text-[12px] lg:text-[16px] xl:text-[18px] font-medium tracking-tight lg:tracking-[-0.36px] max-w-[480px] lg:max-w-[540px] mx-auto">
                        {description}
                    </p>
                </div>

                {/* Primary CTA Button - Responsive scaling for padding and font size */}
                <button
                    onClick={onButtonClick}
                    className="h-[46px] lg:h-[48px] xl:h-[52px] rounded-full px-[24px] lg:px-[28px] xl:px-[32px] flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-[0_8px_16px_rgba(0,53,193,0.15)] group relative overflow-hidden cursor-pointer shrink-0"
                    style={{ background: "linear-gradient(158.68deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                >
                    <span className="text-white text-[14px] lg:text-[16px] xl:text-[18px] font-medium tracking-[-0.18px] relative z-10 transition-opacity group-hover:opacity-90">
                        {buttonText}
                    </span>
                    {/* Inner Shine Effect */}
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
            </motion.div>
        </div>
    );
};
