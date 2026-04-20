"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { AssetHub, AssetFile } from "../shared/AssetHub";

interface BrandIntelligenceProps {
    companyName: string;
    brandBrief: string;
    uploadedFiles: any[];
    onUpdateCompanyName: (val: string) => void;
    onUpdateBrandBrief: (val: string) => void;
    onUpdateFiles: (files: any[]) => void;
    onFileUpload?: (file: File, index: number) => Promise<void>;
    onFileRemoved?: (file: any, index: number) => Promise<void>;
    onCancelUpload?: (index: number) => void;
    onBack: () => void;
    onNext: () => void;
}

// Local interface removed in favor of shared AssetFile

export const BrandIntelligence = ({
    companyName,
    brandBrief,
    uploadedFiles,
    onUpdateCompanyName,
    onUpdateBrandBrief,
    onUpdateFiles,
    onFileUpload,
    onFileRemoved,
    onCancelUpload,
    onBack,
    onNext
}: BrandIntelligenceProps) => {
    const isUploading = uploadedFiles.some(f => f.status === "uploading");
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handlers moved to AssetHub

    return (
        <div className="p-[20px] lg:p-[28px] xl:p-[40px] flex flex-col gap-[32px] xl:gap-[40px]">

            {/* Header */}
            <div className="relative flex items-center justify-center min-h-[80px] lg:min-h-[100px]">
                <button
                    onClick={onBack}
                    className="absolute left-0 top-0 lg:top-1 w-[32px] h-[32px] flex items-center justify-center hover:bg-brand-bg rounded-lg transition-colors cursor-pointer shrink-0 mt-1"
                >
                    <Image src="/dashboard/subscription/arrow-left-02.svg" alt="Back" width={24} height={24} className="lg:w-[32px] lg:h-[32px]" />
                </button>

                <div className="flex flex-col items-center gap-[4px] lg:gap-[8px] text-center px-4 max-w-[80%]">
                    <h1 className="text-brand-navy text-[20px] lg:text-[24px] font-semibold leading-tight">Scale Your Vision</h1>
                    <p className="text-brand-body text-[14px] lg:text-[16px] font-medium tracking-tight">Tailored monthly plans for startups and enterprises</p>

                    {/* Progress Indicator - Step 2 */}
                    <div className="flex items-center gap-[6px] lg:gap-[8px] mt-[12px] lg:mt-[16px]">
                        <div className="w-[32px] lg:w-[40px] h-[32px] lg:h-[40px] border border-[#1c4ed1] rounded-full flex items-center justify-center p-[2px] lg:p-[3px]">
                            <div className="w-full h-full bg-[#1c4ed1] rounded-full" />
                        </div>
                        <div className="w-[32px] lg:w-[40px] h-px bg-[#1c4ed1]" />
                        <div className="w-[32px] lg:w-[40px] h-[32px] lg:h-[40px] border border-[#1c4ed1] rounded-full flex items-center justify-center p-[2px] lg:p-[3px]">
                            <div className="w-full h-full bg-[#1c4ed1] rounded-full" />
                        </div>
                        <div className="w-[32px] lg:w-[40px] h-px bg-brand-stroke" />
                        <div className="w-[32px] lg:w-[40px] h-[32px] lg:h-[40px] border border-brand-stroke rounded-full flex items-center justify-center p-[2px] lg:p-[3px]">
                            {/* Empty circle for step 3 */}
                        </div>
                    </div>
                </div>
            </div>

            {/* Form */}
            <div className="flex flex-col gap-[32px] lg:gap-[40px] max-w-[560px] xl:max-w-[677px] mx-auto w-full pb-[40px]">

                <div className="flex flex-col gap-[24px] lg:gap-[40px]">
                    {/* Company Name */}
                    <div className="flex flex-col gap-[12px] lg:gap-[16px]">
                        <label className="text-brand-body text-[18px] font-semibold tracking-tight">Company Name</label>
                        <input
                            type="text"
                            value={companyName}
                            onChange={(e) => onUpdateCompanyName(e.target.value)}
                            placeholder="e.g. Acme Corp"
                            className="w-full h-[56px] lg:h-[64px] bg-brand-bg border border-brand-stroke rounded-[16px] px-[20px] text-brand-navy font-medium outline-none focus:border-[#1c4ed1] transition-colors"
                        />
                    </div>

                    {/* Brand Brief */}
                    <div className="flex flex-col gap-[12px] lg:gap-[16px]">
                        <label className="text-brand-body text-[18px] font-semibold tracking-tight">Brand Brief</label>
                        <textarea
                            value={brandBrief}
                            onChange={(e) => onUpdateBrandBrief(e.target.value)}
                            placeholder="Tell us about your brand..."
                            className="w-full min-h-[140px] lg:min-h-[160px] bg-brand-bg border border-brand-stroke rounded-[16px] p-[20px] text-brand-navy font-medium outline-none focus:border-[#1c4ed1] transition-colors resize-none"
                        />
                    </div>

                    {/* Brand Assets */}
                    <div className="flex flex-col gap-[12px] lg:gap-[16px]">
                        <div className="flex items-center justify-between">
                            <label className="text-brand-body text-[18px] font-semibold tracking-tight">Brand Assets (Logos, Images)</label>
                            <span className="text-brand-mute text-[14px] font-medium">{uploadedFiles.length} / 5</span>
                        </div>

                        <AssetHub
                            files={uploadedFiles}
                            onUpdateFiles={onUpdateFiles}
                            onFileAdded={onFileUpload}
                            onFileRemoved={onFileRemoved}
                            onCancelUpload={onCancelUpload}
                            maxFiles={5}
                            title="Click to upload or drag and drop"
                            description="SVG, PNG, JPG, PDF (max. 10MB)"
                            icon="upload"
                        />
                    </div>
                </div>

                {/* Next Button */}
                <button
                    onClick={onNext}
                    disabled={!companyName || !brandBrief || isUploading}
                    className={cn(
                        "w-full h-[48px] lg:h-[52px] rounded-full flex items-center justify-center text-white text-[18px] font-medium transition-all shadow-md cursor-pointer",
                        (companyName && brandBrief && !isUploading)
                            ? "bg-linear-to-r from-[#0035C1] to-[#0575FF] hover:brightness-110"
                            : "bg-[#1c4ed1] opacity-50 cursor-not-allowed"
                    )}
                >
                    {isUploading ? "Uploading assets..." : "Next"}
                </button>
            </div>
        </div>
    );
};
