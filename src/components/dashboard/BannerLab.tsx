"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Sub-components
import { BannerLabStepper } from "./banner-lab/BannerLabStepper";
import { BannerLabPreview } from "./banner-lab/BannerLabPreview";
import { Step1_Dimensions } from "./banner-lab/Step1_Dimensions";
import { Step2_VisualExecution } from "./banner-lab/Step2_VisualExecution";
import { Step3_Fulfillment } from "./banner-lab/Step3_Fulfillment";
import { BannerStudioSuccessModal } from "./banner-lab/BannerStudioSuccessModal";
import { BannerLabProps, Step, BannerFormData } from "./banner-lab/types";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-notify";

/**
 * BannerLab - The main orchestrator for the Banner Studio.
 * Implements a split-view design with a floating form card and a separate fixed preview sidebar.
 */
export const BannerLab = ({ onBack }: BannerLabProps) => {
    const [step, setStep] = useState<Step>(1);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
    const [formData, setFormData] = useState<BannerFormData>({
        quality: "Standard",
        size: "85x200",
        environment: "Indoor",
        executionMode: "Create",
        designBrief: "",
        assets: [],
        assetUrls: [],
        readyFile: null,
        readyFileUrl: null,
        quantity: 1,
        fulfillmentType: "Door-to-door",
        shipping: {
            country: "Nigeria",
            state: "",
            city: "",
            streetAddress: "",
            recipientName: "",
            phoneNumber: "",
            instructions: "",
            pickupStation: ""
        },
        isSubmitting: false
    });

    const [previews, setPreviews] = useState<string[]>([]);
    const [isSavingDraft, setIsSavingDraft] = useState(false);

    // Handle form updates
    const updateFormData = (updates: Partial<BannerFormData> | ((prev: BannerFormData) => BannerFormData)) => {
        if (typeof updates === 'function') {
            setFormData(updates);
        } else {
            setFormData(prev => ({ ...prev, ...updates }));
        }
    };

    const handleSaveDraft = async () => {
        try {
            setIsSavingDraft(true);
            const response = await fetch("/api/banners", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...formData, status: "DRAFT" })
            });

            if (response.ok) {
                onBack(); // Go back to dashboard on success
            } else {
                appAlert("Failed to save draft");
            }
        } catch (error) {
            console.error("Save draft error:", error);
        } finally {
            setIsSavingDraft(false);
        }
    };

    return (
        <div className="flex lg:flex-row w-full h-screen bg-brand-bg overflow-hidden relative gap-4">
            {/* Left Content Area - Studio Form Card (Independent Scroll) */}
            <div className={cn(
                "flex-1 flex flex-col min-h-0 bg-white border border-brand-stroke rounded-[24px] 2xl:rounded-[32px]",
                "overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)]"
            )}>
                <div className="flex-1 overflow-y-auto px-6 xl:px-10 py-10 2xl:py-16 scrollbar-hide">
                    <div className="max-w-[760px] mx-auto space-y-10 2xl:space-y-14">
                        {/* Header Action Bar */}
                        <div className="relative flex items-center justify-between w-full">
                            <button
                                onClick={step === 1 ? onBack : () => setStep(prev => (prev - 1) as Step)}
                                disabled={formData.isSubmitting || isSavingDraft}
                                className="size-10 xl:size-12 flex items-center justify-center hover:bg-brand-bg rounded-full transition-all group disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ArrowLeft className="w-5 h-5 2xl:w-6 2xl:h-6 text-brand-navy" />
                            </button>

                            <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none space-y-0.5 xl:space-y-1">
                                <h1 className="text-brand-navy text-[18px] xl:text-[20px] 2xl:text-[28px] font-bold tracking-tight">
                                    Banner Studio
                                </h1>
                            </div>

                            <button
                                onClick={handleSaveDraft}
                                disabled={formData.isSubmitting || isSavingDraft}
                                className="text-[12px] xl:text-[13px] font-black text-brand-blue hover:text-brand-navy transition-colors disabled:opacity-30 px-4 py-2"
                            >
                                {isSavingDraft ? "Saving..." : "Save as Draft"}
                            </button>
                        </div>

                        {/* Stepper */}
                        <div className="flex justify-center">
                            <BannerLabStepper currentStep={step} />
                        </div>

                        {/* Step Content */}
                        <AnimatePresence mode="wait">
                            {step === 1 && (
                                <Step1_Dimensions
                                    key="step1"
                                    formData={formData}
                                    updateFormData={updateFormData}
                                    onNext={() => setStep(2)}
                                />
                            )}
                            {step === 2 && (
                                <Step2_VisualExecution
                                    key="step2"
                                    formData={formData}
                                    updateFormData={updateFormData}
                                    onNext={() => setStep(3)}
                                    onPrev={() => setStep(1)}
                                />
                            )}
                            {step === 3 && (
                                <Step3_Fulfillment
                                    key="step3"
                                    formData={formData}
                                    updateFormData={updateFormData}
                                    onPrev={() => setStep(2)}
                                    onSubmit={async () => {
                                        try {
                                            updateFormData({ isSubmitting: true });
                                            console.log("Submitting:", formData);
                                            const response = await fetch("/api/banners", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify(formData)
                                            });

                                            if (response.ok) {
                                                setIsSuccessModalOpen(true);
                                            } else {
                                                console.error("Failed to submit banner order");
                                            }
                                        } catch (error) {
                                            console.error("Submission error:", error);
                                        } finally {
                                            updateFormData({ isSubmitting: false });
                                        }
                                    }}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Right Side - Fixed Live Preview Sidebar */}
            <BannerLabPreview previews={previews} formData={formData} />

            {/* Success Modal */}
            <BannerStudioSuccessModal
                isOpen={isSuccessModalOpen}
                onClose={() => {
                    setIsSuccessModalOpen(false);
                    onBack();
                }}
            />
        </div>
    );
};
