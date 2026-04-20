"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BannerFormData } from "./types";

interface Step1Props {
    formData: BannerFormData;
    updateFormData: (updates: Partial<BannerFormData>) => void;
    onNext: () => void;
}

export const Step1_Dimensions = ({ formData, updateFormData, onNext }: Step1Props) => {
    const sizeOptions = [
        { id: "80x200", label: "80cm x 200cm", sub: "Compact - Perfect for tight spaces" },
        { id: "85x200", label: "85cm x 200cm", sub: "Standard - Most popular size" },
        { id: "100x200", label: "100cm x 200cm", sub: "Wide - Maximum visibility" },
        { id: "120x200", label: "120cm x 200cm", sub: "Premium - Trade show ready" },
    ] as const;

    const environmentOptions = [
        { id: "Indoor", label: "Indoor", sub: "Events, offices, showrooms" },
        { id: "Outdoor", label: "Outdoor", sub: "Weather-resistant material" },
    ] as const;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6 xl:space-y-8 2xl:space-y-12"
        >
            {/* Frame & Dimensions */}
            <div className="space-y-3 xl:space-y-4 2xl:space-y-6">
                <h3 className="text-brand-navy text-[15px] xl:text-[16px] 2xl:text-[20px] font-bold tracking-tight">Frame & Dimensions</h3>
                <div className="flex gap-3 xl:gap-4 2xl:gap-6">
                    {(["Standard", "Premium"] as const).map((q) => (
                        <button
                            key={q}
                            onClick={() => updateFormData({ quality: q })}
                            className={cn(
                                "flex-1 h-[48px] xl:h-[52px] 2xl:h-[64px] rounded-[10px] 2xl:rounded-[16px] border transition-all flex flex-col items-center justify-center gap-0 2xl:gap-1",
                                formData.quality === q
                                    ? "bg-[#F0F5FF] border-brand-blue text-brand-blue"
                                    : "bg-white border-brand-stroke text-brand-body hover:border-brand-blue/30"
                            )}
                        >
                            <span className="text-[13px] xl:text-[14px] 2xl:text-[16px] font-bold tracking-tight">{q}</span>
                            <span className={cn(
                                "text-[8px] xl:text-[9px] 2xl:text-[10px] font-medium tracking-tight opacity-70",
                                formData.quality === q ? "text-brand-blue" : "text-brand-mute"
                            )}>
                                {q === "Standard" ? "Basic flex material" : "Premium printing material"}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Banner Size */}
            <div className="space-y-3 xl:space-y-4 2xl:space-y-6">
                <h3 className="text-brand-navy text-[15px] xl:text-[16px] 2xl:text-[20px] font-bold tracking-tight">Banner Size</h3>
                <div className="grid grid-cols-1 gap-2 xl:gap-3 2xl:gap-4">
                    {sizeOptions.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => updateFormData({ size: opt.id })}
                            className={cn(
                                "w-full px-4 py-3 xl:px-5 xl:py-4 2xl:px-7 2xl:py-6 rounded-[10px] 2xl:rounded-[16px] border-2 transition-all flex items-center gap-4 xl:gap-5 2xl:gap-7 text-left group",
                                formData.size === opt.id
                                    ? "bg-[#F0F5FF]/50 border-brand-blue shadow-sm"
                                    : "bg-white border-brand-stroke hover:border-brand-blue/20"
                            )}
                        >
                            <div className={cn(
                                "size-5 xl:size-6 2xl:size-7 rounded-full border-2 flex items-center justify-center transition-all",
                                formData.size === opt.id ? "border-brand-blue bg-white" : "border-brand-stroke group-hover:border-brand-blue/30"
                            )}>
                                {formData.size === opt.id && <div className="size-2.5 xl:size-3 2xl:size-3.5 rounded-full bg-brand-blue" />}
                            </div>
                            <div className="flex flex-col">
                                <span className={cn(
                                    "text-[13px] xl:text-[14px] 2xl:text-[17px] font-bold tracking-tight leading-none",
                                    formData.size === opt.id ? "text-brand-navy" : "text-brand-body"
                                )}>{opt.label}</span>
                                <span className="text-brand-mute text-[10px] xl:text-[11px] 2xl:text-[13px] font-medium mt-0.5">{opt.sub}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Usage Environment */}
            <div className="space-y-3 xl:space-y-4 2xl:space-y-6">
                <h3 className="text-brand-navy text-[15px] xl:text-[16px] 2xl:text-[20px] font-bold tracking-tight">Usage Environment</h3>
                <div className="grid grid-cols-1 gap-2 xl:gap-3 2xl:gap-4">
                    {environmentOptions.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => updateFormData({ environment: opt.id })}
                            className={cn(
                                "w-full px-4 py-3 xl:px-5 xl:py-4 2xl:px-7 2xl:py-6 rounded-[10px] 2xl:rounded-[16px] border-2 transition-all flex items-center gap-4 xl:gap-5 2xl:gap-7 text-left group",
                                formData.environment === opt.id
                                    ? "bg-[#F0F5FF]/50 border-brand-blue shadow-sm"
                                    : "bg-white border-brand-stroke hover:border-brand-blue/20"
                            )}
                        >
                            <div className={cn(
                                "size-5 xl:size-6 2xl:size-7 rounded-full border-2 flex items-center justify-center transition-all",
                                formData.environment === opt.id ? "border-brand-blue bg-white" : "border-brand-stroke group-hover:border-brand-blue/30"
                            )}>
                                {formData.environment === opt.id && <div className="size-2.5 xl:size-3 2xl:size-3.5 rounded-full bg-brand-blue" />}
                            </div>
                            <div className="flex flex-col">
                                <span className={cn(
                                    "text-[13px] xl:text-[14px] 2xl:text-[17px] font-bold tracking-tight leading-none",
                                    formData.environment === opt.id ? "text-brand-navy" : "text-brand-body"
                                )}>{opt.label}</span>
                                <span className="text-brand-mute text-[10px] xl:text-[11px] 2xl:text-[13px] font-medium mt-0.5">{opt.sub}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Next Action */}
            <div className="pt-4 xl:pt-6 2xl:pt-12">
                <button
                    onClick={onNext}
                    className="w-full h-[48px] xl:h-[52px] 2xl:h-[72px] bg-brand-blue rounded-full text-white font-bold text-[15px] xl:text-[16px] 2xl:text-[20px] hover:bg-brand-blue/90 transition-all active:scale-[0.98] shadow-lg shadow-brand-blue/20"
                >
                    Next
                </button>
            </div>
        </motion.div>
    );
};
