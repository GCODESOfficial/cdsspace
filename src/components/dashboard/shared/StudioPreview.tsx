"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface StudioPreviewProps {
    title?: string;
    subtitle?: string;
    children?: React.ReactNode;
    isEmpty?: boolean;
    className?: string;
    footer?: React.ReactNode;
}

/**
 * StudioPreview - A high-fidelity, compact sidebar for live previews.
 * Designed to be fixed/sticky within its parent container.
 */
export const StudioPreview = ({
    title = "Live Preview",
    subtitle = "Visual mockup of your design",
    children,
    isEmpty = false,
    className,
    footer
}: StudioPreviewProps) => {
    return (
        <div className={cn(
            "hidden lg:flex flex-col w-[260px] xl:w-[280px] 2xl:w-[360px] bg-white border-l border-brand-stroke shrink-0 h-screen sticky top-0 z-40 rounded-[16px]",
            className
        )}>
            <div className="flex flex-col h-full p-4 overflow-y-auto scrollbar-hide">
                {/* Header Title & Subtitle - Scaled down */}
                <div className="text-center space-y-1 2xl:space-y-1.5 mb-8 2xl:mb-12 pt-4">
                    <h2 className="text-[#040B37] text-[16px] xl:text-[18px] 2xl:text-[22px] font-bold tracking-tight">{title}</h2>
                    <p className="text-[#4B5563] text-[12px] xl:text-[13px] 2xl:text-[14px] font-medium">{subtitle}</p>
                </div>

                {/* Mockup Presentation Container - More compact Aspect Ratio */}
                <div className="aspect-square bg-[#F4F6FB] rounded-[20px] 2xl:rounded-[28px] border-2 border-[#E3E8F4] border-dashed flex flex-col items-center justify-center p-6 2xl:p-10 relative overflow-hidden group">
                    {isEmpty ? (
                        <div className="flex flex-col items-center justify-center gap-4 2xl:gap-6 text-center animate-in fade-in zoom-in duration-500">
                            {/* Smaller Eye Icon Box */}
                            <div className="size-16 2xl:size-20 rounded-full bg-[#E3E8F4]/50 flex items-center justify-center">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-8 2xl:size-10 opacity-30 text-[#4B5563]">
                                    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <div className="space-y-1.5 2xl:space-y-2">
                                <p className="text-[#4B5563] text-[13px] 2xl:text-[16px] font-bold tracking-tight leading-none">No Products Selected</p>
                                <p className="text-[#9CA3AF] text-[11px] 2xl:text-[13px] font-medium leading-relaxed max-w-[160px] 2xl:max-w-[200px]">
                                    Select products from the gallery to see them here
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full relative flex flex-col items-center justify-center">
                            {children}
                        </div>
                    )}
                </div>

                {/* Optional Footer - Scaled */}
                {footer && (
                    <div className="pt-6 2xl:pt-10 mt-auto">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
