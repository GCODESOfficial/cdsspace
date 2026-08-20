"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface StudioPreviewProps {
    title?: string;
    subtitle?: string;
    children?: React.ReactNode;
    isEmpty?: boolean;
    className?: string;
    previewClassName?: string;
    footer?: React.ReactNode;
    statusLabel?: string;
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
    previewClassName,
    footer,
    statusLabel,
}: StudioPreviewProps) => {
    return (
        <div data-preview-status={statusLabel} className={cn(
            "hidden h-full min-h-[calc(100vh-96px)] w-full flex-col bg-white lg:flex",
            className
        )}>
            <div className="flex min-h-0 flex-1 flex-col p-4">
                {/* Header Title & Subtitle - Scaled down */}
                <div className="mb-5 space-y-1 pt-3 text-center 2xl:mb-7 2xl:space-y-1.5">
                    <h2 className="text-[#040B37] text-[16px] xl:text-[18px] 2xl:text-[22px] font-bold tracking-tight">{title}</h2>
                    <p className="text-[#4B5563] text-[12px] xl:text-[13px] 2xl:text-[14px] font-medium">{subtitle}</p>
                </div>

                {/* Mockup Presentation Container - More compact Aspect Ratio */}
                <div className={cn("relative flex min-h-[420px] flex-1 flex-col items-center justify-center overflow-hidden rounded-[20px] border-2 border-dashed border-[#E3E8F4] bg-[#F4F6FB] p-6 2xl:rounded-[28px] 2xl:p-10", previewClassName)}>
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
