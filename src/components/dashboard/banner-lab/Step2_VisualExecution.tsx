import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { AssetHub, AssetFile } from "../../shared/AssetHub";
import { cn } from "@/lib/utils";
import { BannerFormData } from "./types";
import { AlertCircle, CheckCircle2, Edit3, UploadCloud } from "lucide-react";
import { storageService } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/client";

interface Step2Props {
    formData: BannerFormData;
    updateFormData: (updates: Partial<BannerFormData> | ((prev: BannerFormData) => BannerFormData)) => void;
    onNext: () => void;
    onPrev: () => void;
}

const BANNER_ACCEPTED_TYPES = ".svg,.png,.jpg,.jpeg,.pdf,.zip,.ai,.psd";
const BANNER_MIME_DESCRIPTION = "SVG, PNG, JPG, PDF, ZIP, AI, PSD (max. 10MB)";

export const Step2_VisualExecution = ({ formData, updateFormData, onNext, onPrev }: Step2Props) => {
    const supabase = createClient();

    const handleUpload = async (file: File, index: number, isReadyFile: boolean) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            const path = storageService.generatePath(user.id, file.name);
            const bucket = "banners"; // Using existing bucket for simplicity

            await storageService.uploadFile(file, bucket, path);

            // For now we store the path, but in a real app we might want the signed URL or public URL
            if (isReadyFile) {
                updateFormData(prev => {
                    const readyFile = prev.readyFile as AssetFile;
                    if (readyFile) {
                        readyFile.status = 'success';
                    }
                    return {
                        ...prev,
                        readyFileUrl: path,
                        readyFile: readyFile
                    };
                });
            } else {
                updateFormData(prev => {
                    const newAssetUrls = [...prev.assetUrls];
                    newAssetUrls[index] = path;

                    const newAssets = [...prev.assets] as AssetFile[];
                    if (newAssets[index]) {
                        newAssets[index].status = 'success';
                    }
                    
                    return {
                        ...prev,
                        assetUrls: newAssetUrls,
                        assets: newAssets
                    };
                });
            }
        } catch (error) {
            console.error("Upload failed:", error);
            if (isReadyFile) {
                updateFormData(prev => {
                    const readyFile = prev.readyFile as AssetFile;
                    if (readyFile) {
                        readyFile.status = 'error';
                    }
                    return { ...prev, readyFile };
                });
            } else {
                updateFormData(prev => {
                    const newAssets = [...prev.assets] as AssetFile[];
                    if (newAssets[index]) {
                        newAssets[index].status = 'error';
                    }
                    return { ...prev, assets: newAssets };
                });
            }
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6 xl:space-y-8 2xl:space-y-12"
        >
            {/* Visual Execution Toggle */}
            <div className="space-y-3 xl:space-y-4 2xl:space-y-6">
                <hgroup className="space-y-1">
                    <h3 className="text-brand-navy text-[15px] xl:text-[16px] 2xl:text-[20px] font-bold tracking-tight">Visual Execution</h3>
                    <p className="text-brand-mute text-[11px] xl:text-[12px] 2xl:text-[14px] font-medium">Choose how you want to provide your design</p>
                </hgroup>
                <div className="flex gap-3 2xl:gap-4">
                    <button
                        disabled={formData.isSubmitting}
                        onClick={() => updateFormData({ executionMode: "Upload" })}
                        className={cn(
                            "flex-1 h-[48px] xl:h-[52px] 2xl:h-[60px] rounded-[10px] 2xl:rounded-[16px] border flex items-center justify-center gap-2 2xl:gap-3 text-[13px] xl:text-[14px] 2xl:text-[16px] font-bold transition-all px-4 disabled:opacity-50",
                            formData.executionMode === "Upload"
                                ? "bg-[#F0F5FF] border-brand-blue text-brand-blue shadow-sm shadow-brand-blue/5"
                                : "bg-white border-brand-stroke text-brand-mute hover:border-brand-blue/30"
                        )}
                    >
                        <UploadCloud className="w-4 h-4 xl:w-4.5 xl:h-4.5 2xl:w-5 2xl:h-5" />
                        <span className="truncate">Upload Ready File</span>
                    </button>
                    <button
                        disabled={formData.isSubmitting}
                        onClick={() => updateFormData({ executionMode: "Create" })}
                        className={cn(
                            "flex-1 h-[48px] xl:h-[52px] 2xl:h-[60px] rounded-[10px] 2xl:rounded-[16px] border flex items-center justify-center gap-2 2xl:gap-3 text-[13px] xl:text-[14px] 2xl:text-[16px] font-bold transition-all px-4 disabled:opacity-50",
                            formData.executionMode === "Create"
                                ? "bg-[#F0F5FF] border-brand-blue text-brand-blue shadow-sm shadow-brand-blue/5"
                                : "bg-white border-brand-stroke text-brand-mute hover:border-brand-blue/30"
                        )}
                    >
                        <Edit3 className="w-4 h-4 xl:w-4.5 xl:h-4.5 2xl:w-5 2xl:h-5" />
                        <span className="truncate">Create New Design</span>
                    </button>
                </div>
            </div>

            {/* Sub-Views based on executionMode */}
            {formData.executionMode === "Upload" ? (
                <div className="space-y-6 xl:space-y-8 2xl:space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    {/* Upload Zone */}
                    <div className="space-y-3 xl:space-y-4 2xl:space-y-6">
                        <AssetHub
                            files={formData.readyFile ? [formData.readyFile as AssetFile] : []}
                            onUpdateFiles={(files) => updateFormData({ readyFile: files[0] || null })}
                            onFileAdded={(file, idx) => handleUpload(file, idx, true)}
                            acceptedTypes={BANNER_ACCEPTED_TYPES}
                            description={BANNER_MIME_DESCRIPTION}
                            maxFiles={1}
                            title="Drop your print-ready file here"
                            icon="folder"
                            className="h-[140px] 2xl:h-[180px]"
                        />
                    </div>

                    {/* Print Requirements Card */}
                    <div className="bg-brand-bg rounded-[14px] 2xl:rounded-[24px] border border-brand-stroke p-4 xl:p-5 2xl:p-8 space-y-3 xl:space-y-4 2xl:space-y-6">
                        <h4 className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[16px] font-bold">Print Requirements:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2 xl:gap-3 2xl:gap-4">
                            {[
                                { label: "CMYK color mode", status: "ok" },
                                { label: "300 DPI minimum resolution", status: "ok" },
                                { label: "3mm bleed on all sides", status: "ok" },
                                { label: "Accepted formats: PDF, AI, PSD, JPG/PNG", status: "warn" }
                            ].map((req, i) => (
                                <div key={i} className="flex items-center gap-2 xl:gap-2.5 2xl:gap-3">
                                    {req.status === "ok" ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-[#34A853]" />
                                    ) : (
                                        <AlertCircle className="w-3.5 h-3.5 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-[#F9AB00]" />
                                    )}
                                    <span className="text-brand-body text-[11px] xl:text-[12px] 2xl:text-[14px] font-medium opacity-80">{req.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6 xl:space-y-8 2xl:space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    {/* Design Brief */}
                    <div className="space-y-3 xl:space-y-4 2xl:space-y-6">
                        <h3 className="text-brand-navy text-[15px] xl:text-[16px] 2xl:text-[20px] font-bold">Design Brief</h3>
                        <textarea
                            disabled={formData.isSubmitting}
                            value={formData.designBrief}
                            onChange={(e) => updateFormData({ designBrief: e.target.value })}
                            placeholder="Goals, audience, timeline, and references help us a lot."
                            className="w-full h-24 xl:h-32 2xl:h-40 p-4 xl:p-5 2xl:p-6 rounded-[14px] 2xl:rounded-[24px] bg-brand-bg border border-transparent outline-none text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute focus:ring-2 focus:ring-brand-blue/20 transition-all resize-none disabled:opacity-50"
                        />
                    </div>

                    {/* Brand Assets */}
                    <div className="space-y-3 xl:space-y-4 2xl:space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-brand-navy text-[15px] xl:text-[16px] 2xl:text-[20px] font-bold">Brand Assets (Logos, Images)</h3>
                            <span className="text-brand-mute text-[11px] xl:text-[12px] 2xl:text-[14px] font-bold">{formData.assets.length} / 5</span>
                        </div>

                        <AssetHub
                            files={formData.assets as AssetFile[]}
                            onUpdateFiles={(files) => updateFormData({ assets: files })}
                            onFileAdded={(file, idx) => handleUpload(file, idx, false)}
                            acceptedTypes={BANNER_ACCEPTED_TYPES}
                            description={BANNER_MIME_DESCRIPTION}
                            maxFiles={5}
                            title="Drop brand assets here"
                            icon="upload"
                        />
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3 xl:gap-4 pt-4 xl:pt-6 2xl:pt-12">
                <button
                    onClick={onPrev}
                    disabled={formData.isSubmitting}
                    className="flex-1 h-[48px] xl:h-[52px] 2xl:h-[72px] rounded-full border-2 border-brand-stroke text-brand-navy font-bold text-[14px] xl:text-[15px] 2xl:text-[18px] hover:bg-brand-bg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Back
                </button>
                <button
                    onClick={onNext}
                    disabled={formData.isSubmitting || (formData.executionMode === "Upload" && !formData.readyFile)}
                    className="flex-[2] h-[48px] xl:h-[52px] 2xl:h-[72px] bg-brand-blue rounded-full text-white font-bold text-[15px] xl:text-[16px] 2xl:text-[20px] hover:bg-brand-blue/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-blue/20"
                >
                    Next Step
                </button>
            </div>
        </motion.div>
    );
};
