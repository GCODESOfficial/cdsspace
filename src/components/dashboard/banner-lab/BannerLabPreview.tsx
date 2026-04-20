"use client";

import React from "react";
import { EyeIcon, ImageIcon } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { StudioPreview } from "../shared/StudioPreview";

import { BannerFormData } from "./types";

interface PreviewProps {
    previews: string[];
    formData: BannerFormData;
}

export const BannerLabPreview = ({ previews, formData }: PreviewProps) => {
    const hasImage = previews.length > 0;

    return (
        <StudioPreview
            isEmpty={!hasImage}
        >
            <div className={cn(
                "relative w-[80%] h-[85%] 2xl:w-[85%] 2xl:h-[90%] bg-white shadow-[0_15px_40px_rgba(0,0,0,0.06)] 2xl:shadow-[0_20px_50px_rgba(0,0,0,0.08)] transition-all duration-500 flex flex-col items-center border border-black/5 rounded-t-sm",
            )}>
                {/* Internal Material Highlight Effect */}
                <div className="absolute inset-0 bg-linear-to-tr from-white/0 via-white/5 to-white/0 pointer-events-none" />

                {hasImage ? (
                    <Image
                        src={previews[previews.length - 1]}
                        alt="Banner Mockup"
                        fill
                        className="object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-white gap-2 2xl:gap-4 opacity-30 px-6 text-center">
                        <EyeIcon className="w-12 h-12 xl:w-16 xl:h-16 text-brand-mute" />
                        <p className="text-brand-navy font-bold text-[12px] xl:text-[14px]">Admin mockup will appear here</p>
                    </div>
                )}

                {/* Stand Base Rail (Minimalist Figma Style) */}
                <div className={cn(
                    "absolute bottom-[-8px] 2xl:bottom-[-10px] w-[104%] 2xl:w-[106%] h-[12px] xl:h-[14px] 2xl:h-[20px] bg-[#E5E7EB] rounded-sm shadow-md z-20 flex items-center justify-center overflow-hidden border-b border-black/10",
                )}>
                    <div className="w-full h-px 2xl:h-px bg-white/40 absolute top-px 2xl:top-px" />
                </div>
            </div>
        </StudioPreview>
    );
};
