import React from "react";
import { motion } from "framer-motion";
import { AssetHub, AssetFile } from "../../shared/AssetHub";
import { cn } from "@/lib/utils";
import { BannerFormData } from "./types";
import { AlertCircle, CheckCircle2, Edit3, Minus, Plus, UploadCloud } from "lucide-react";
import { formatMoney, type Currency } from "@/lib/finance/types";
import { bannerPrice, type BannerDesignService } from "@/lib/banner-commerce";
import { appAlert } from "@/lib/app-notify";

interface Step2Props {
    formData: BannerFormData;
    updateFormData: (updates: Partial<BannerFormData> | ((prev: BannerFormData) => BannerFormData)) => void;
    onNext: () => void;
    onPrev: () => void;
    currency: Currency;
    designService: BannerDesignService | null;
}

const BANNER_ACCEPTED_TYPES = ".png,.jpg,.jpeg,.pdf,.ai,.fig,.svg";
const BANNER_MIME_DESCRIPTION = "PNG, JPG, PDF, AI, FIG, SVG (max. 20MB)";
const BANNER_MAX_FILE_SIZE_MB = 20;
const BANNER_ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "ai", "fig", "svg"]);

export const Step2_VisualExecution = ({ formData, updateFormData, onNext, onPrev, currency, designService }: Step2Props) => {
    const quantity = Math.max(1, Math.min(1000, Number(formData.quantity) || 1));
    const completedArtworkCount = formData.readyFiles.filter((file) => (file as AssetFile).status === "success" && Boolean((file as AssetFile).storagePath)).length;

    const syncReadyFiles = (files: AssetFile[]) => {
        const urls = files.map((file) => file.storagePath).filter((path): path is string => Boolean(path));
        updateFormData({
            readyFiles: files,
            readyFileUrls: urls,
            readyFile: files[0] || null,
            readyFileUrl: urls[0] || null,
        });
    };

    const changeQuantity = (nextQuantity: number) => {
        const normalized = Math.max(1, Math.min(1000, nextQuantity || 1));
        const keepCount = Math.min(normalized, formData.readyFiles.length);
        updateFormData({
            quantity: normalized,
            readyFiles: formData.readyFiles.slice(0, keepCount),
            readyFileUrls: formData.readyFileUrls.slice(0, keepCount),
            readyFile: formData.readyFiles[0] || null,
            readyFileUrl: formData.readyFileUrls[0] || null,
        });
    };

    const handleUpload = async (file: File, index: number, isReadyFile: boolean) => {
        try {
            const extension = file.name.split(".").pop()?.toLowerCase() || "";
            if (!BANNER_ALLOWED_EXTENSIONS.has(extension)) {
                throw new Error("Use a PNG, JPG, PDF, AI, FIG, or SVG file.");
            }
            if (file.size > BANNER_MAX_FILE_SIZE_MB * 1024 * 1024) {
                throw new Error(`Files must not exceed ${BANNER_MAX_FILE_SIZE_MB}MB.`);
            }
            const uploadForm = new FormData();
            uploadForm.set("file", file);
            uploadForm.set("category", isReadyFile ? "artwork" : "reference");
            if (isReadyFile) {
                const standardDimensions = formData.size.split("x").map((value) => Number(value));
                const targetWidth = formData.isCustom ? Number(formData.customWidth) : standardDimensions[0];
                const targetHeight = formData.isCustom ? Number(formData.customHeight) : standardDimensions[1];
                if (targetWidth > 0 && targetHeight > 0) {
                    uploadForm.set("targetWidth", String(targetWidth));
                    uploadForm.set("targetHeight", String(targetHeight));
                }
            }
            const response = await fetch("/api/banners/upload", { method: "POST", body: uploadForm });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || "The print file could not be uploaded.");
            const path = String(payload.storagePath || "");
            if (!path) throw new Error("The uploaded file did not return a storage path.");

            // For now we store the path, but in a real app we might want the signed URL or public URL
            if (isReadyFile) {
                updateFormData(prev => {
                    const readyFiles = [...prev.readyFiles] as AssetFile[];
                    if (readyFiles[index]) {
                        readyFiles[index] = Object.assign(readyFiles[index], {
                            status: "success" as const,
                            progress: 100,
                            storagePath: path,
                            // Keep the instant blob preview. Replacing it here
                            // caused a visible broken image whenever a storage
                            // URL had not propagated yet. Restored drafts use
                            // the authenticated preview route from the server.
                            preview: readyFiles[index].preview || payload.previewUrl,
                        });
                    }
                    const readyFileUrls = readyFiles.map((item) => item.storagePath).filter((item): item is string => Boolean(item));
                    return {
                        ...prev,
                        readyFiles,
                        readyFileUrls,
                        readyFile: readyFiles[0] || null,
                        readyFileUrl: readyFileUrls[0] || null,
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
            void appAlert(error instanceof Error ? error.message : "The artwork could not be uploaded.");
            if (isReadyFile) {
                updateFormData(prev => {
                    const readyFiles = [...prev.readyFiles] as AssetFile[];
                    if (readyFiles[index]) {
                        readyFiles[index] = Object.assign(readyFiles[index], { status: "error" as const });
                    }
                    return { ...prev, readyFiles, readyFile: readyFiles[0] || null };
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
                        <span className="truncate">Create New Design{formData.isCustom ? " · added to quote" : designService ? ` · ${formatMoney(bannerPrice(designService.prices, currency), currency)}` : ""}</span>
                    </button>
                </div>
            </div>

            {/* Sub-Views based on executionMode */}
            {formData.executionMode === "Upload" ? (
                <div className="space-y-6 xl:space-y-8 2xl:space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="rounded-[18px] border border-blue-100 bg-blue-50/70 p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
                        <div>
                            <h3 className="text-[13px] font-bold text-[#0D1B39]">How many printed banners do you need?</h3>
                            <p className="mt-1 text-[11px] leading-5 text-slate-500">Upload one finished design for every banner. Quantity {quantity} requires {quantity} design{quantity === 1 ? "" : "s"}.</p>
                        </div>
                        <div className="mt-3 flex h-11 min-w-[168px] items-center rounded-2xl border border-blue-100 bg-white p-1 sm:mt-0">
                            <button type="button" onClick={() => changeQuantity(quantity - 1)} disabled={formData.isSubmitting || quantity <= 1} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-30" aria-label="Decrease banner quantity"><Minus className="h-4 w-4" /></button>
                            <input type="number" min="1" max="1000" value={quantity} onChange={(event) => changeQuantity(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent text-center text-[14px] font-bold text-[#0D1B39] outline-none" aria-label="Banner quantity" />
                            <button type="button" onClick={() => changeQuantity(quantity + 1)} disabled={formData.isSubmitting || quantity >= 1000} className="grid h-9 w-9 place-items-center rounded-xl text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-30" aria-label="Increase banner quantity"><Plus className="h-4 w-4" /></button>
                        </div>
                    </div>
                    {/* Upload Zone */}
                    <div className="space-y-3 xl:space-y-4 2xl:space-y-6">
                        <div className="flex items-center justify-between text-[11px] font-semibold"><span className="text-slate-500">Print-ready designs</span><span className={completedArtworkCount === quantity ? "text-emerald-600" : "text-[#0A4FE8]"}>{completedArtworkCount} of {quantity} uploaded</span></div>
                        <AssetHub
                            files={formData.readyFiles as AssetFile[]}
                            onUpdateFiles={syncReadyFiles}
                            onFileAdded={(file, idx) => handleUpload(file, idx, true)}
                            acceptedTypes={BANNER_ACCEPTED_TYPES}
                            description={BANNER_MIME_DESCRIPTION}
                            maxSizeMB={BANNER_MAX_FILE_SIZE_MB}
                            maxFiles={quantity}
                            title={`Drop ${quantity === 1 ? "your print-ready design" : `up to ${quantity} print-ready designs`} here`}
                            icon="folder"
                            className="h-[140px] 2xl:h-[180px]"
                        />
                    </div>

                    {/* Print Requirements Card */}
                    <div className="bg-brand-bg rounded-[14px] 2xl:rounded-[24px] border border-brand-stroke p-4 xl:p-5 2xl:p-8 space-y-3 xl:space-y-4 2xl:space-y-6">
                        <h4 className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[16px] font-bold">Print Requirements:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2 xl:gap-3 2xl:gap-4">
                            {[
                                { label: "RGB color mode", status: "ok" },
                                { label: "300 DPI minimum resolution", status: "ok" },
                                { label: "3mm bleed on all sides", status: "ok" },
                                { label: "Accepted formats: PNG, JPG, PDF, AI, FIG, SVG", status: "warn" }
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
                            placeholder="Describe the goal, audience, tone, visual direction and where the banner will be used."
                            className="w-full h-24 xl:h-32 2xl:h-40 p-4 xl:p-5 2xl:p-6 rounded-[14px] 2xl:rounded-[24px] bg-brand-bg border border-transparent outline-none text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute focus:ring-2 focus:ring-brand-blue/20 transition-all resize-none disabled:opacity-50"
                        />
                    </div>

                    <div className="space-y-3 xl:space-y-4">
                        <h3 className="text-brand-navy text-[15px] xl:text-[16px] 2xl:text-[20px] font-bold">Exact content to include</h3>
                        <textarea
                            disabled={formData.isSubmitting}
                            value={formData.designContent}
                            onChange={(e) => updateFormData({ designContent: e.target.value })}
                            placeholder="Paste the headline, body copy, dates, venue, phone numbers, website, call-to-action and any mandatory wording."
                            className="w-full h-28 xl:h-32 p-4 xl:p-5 rounded-[14px] bg-brand-bg border border-transparent outline-none text-brand-navy text-[13px] xl:text-[14px] font-medium placeholder:text-brand-mute focus:ring-2 focus:ring-brand-blue/20 transition-all resize-none disabled:opacity-50"
                        />
                    </div>

                    <div className="space-y-3 xl:space-y-4">
                        <h3 className="text-brand-navy text-[15px] xl:text-[16px] 2xl:text-[20px] font-bold">Reference notes or links</h3>
                        <textarea
                            disabled={formData.isSubmitting}
                            value={formData.referenceNotes}
                            onChange={(e) => updateFormData({ referenceNotes: e.target.value })}
                            placeholder="Add links to inspiration, brand guidelines or explain what to follow and what to avoid."
                            className="w-full h-24 p-4 xl:p-5 rounded-[14px] bg-brand-bg border border-transparent outline-none text-brand-navy text-[13px] xl:text-[14px] font-medium placeholder:text-brand-mute focus:ring-2 focus:ring-brand-blue/20 transition-all resize-none disabled:opacity-50"
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
                            maxSizeMB={BANNER_MAX_FILE_SIZE_MB}
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
                    disabled={formData.isSubmitting || (formData.executionMode === "Upload" ? completedArtworkCount !== quantity : (!formData.designBrief.trim() || !formData.designContent.trim() || (!formData.isCustom && (!designService || bannerPrice(designService.prices, currency) <= 0))))}
                    className="flex-[2] h-[48px] xl:h-[52px] 2xl:h-[72px] bg-brand-blue rounded-full text-white font-bold text-[15px] xl:text-[16px] 2xl:text-[20px] hover:bg-brand-blue/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-blue/20"
                >
                    Next Step
                </button>
            </div>
        </motion.div>
    );
};
