"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Crown, Minus, Plus } from "lucide-react";
import { PortfolioViewer } from "./PortfolioViewer";
import { validateReferralCode } from "@/lib/actions/subscription";

interface CollaborationLeadProps {
    selectedPlanId: string;
    fullName: string;
    email: string;
    phone: string;
    designCount: number;
    isReferred: boolean;
    referralCode: string;
    firstRequestTitle: string;
    firstRequestDesc: string;
    onUpdateFullName: (val: string) => void;
    onUpdateEmail: (val: string) => void;
    onUpdatePhone: (val: string) => void;
    onUpdateDesignCount: (val: number | ((prev: number) => number)) => void;
    onUpdateIsReferred: (val: boolean) => void;
    onUpdateReferralCode: (val: string) => void;
    onUpdateFirstRequestTitle: (val: string) => void;
    onUpdateFirstRequestDesc: (val: string) => void;
    onUpgrade: (nextPlanId: string) => void;
    onBack: () => void;
    onActivate: () => void;
}

const planLimits = {
    startup: { limit: 5, next: "Scaleup" },
    scaleup: { limit: 10, next: "Supreme" },
    supreme: { limit: 99, next: "" },
};

export const CollaborationLead = ({
    selectedPlanId,
    fullName,
    email,
    phone,
    designCount,
    isReferred,
    referralCode,
    firstRequestTitle,
    firstRequestDesc,
    onUpdateFullName,
    onUpdateEmail,
    onUpdatePhone,
    onUpdateDesignCount,
    onUpdateIsReferred,
    onUpdateReferralCode,
    onUpdateFirstRequestTitle,
    onUpdateFirstRequestDesc,
    onUpgrade,
    onBack,
    onActivate,
}: CollaborationLeadProps) => {
    const [referralStatus, setReferralStatus] = useState<{ loading: boolean, valid: boolean, name?: string }>({ loading: false, valid: false });
    const [showFirstRequest, setShowFirstRequest] = useState(false);

    // Validate referral code with a small delay
    useEffect(() => {
        if (!isReferred || !referralCode || referralCode.length < 4) {
            setReferralStatus({ loading: false, valid: false });
            return;
        }

        const timer = setTimeout(async () => {
            setReferralStatus(prev => ({ ...prev, loading: true }));
            const res = await validateReferralCode(referralCode);
            setReferralStatus({ loading: false, valid: res.valid, name: res.name });
        }, 500);

        return () => clearTimeout(timer);
    }, [referralCode, isReferred]);

    const currentPlan = planLimits[selectedPlanId as keyof typeof planLimits] || planLimits.startup;

    return (
        <div className="p-[20px] lg:p-[28px] xl:p-[40px] flex flex-col gap-[32px] xl:gap-[40px]">

            {/* Header with Back Button */}
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

                    {/* Progress Indicator - Step 3 (All blue for completed steps) */}
                    <div className="flex items-center gap-[6px] lg:gap-[8px] mt-[12px] lg:mt-[16px]">
                        <div className="w-[32px] lg:w-[40px] h-[32px] lg:h-[40px] border border-[#1c4ed1] rounded-full flex items-center justify-center p-[2px] lg:p-[3px]">
                            <div className="w-full h-full bg-[#1c4ed1] rounded-full" />
                        </div>
                        <div className="w-[32px] lg:w-[40px] h-px bg-[#1c4ed1]" />
                        <div className="w-[32px] lg:w-[40px] h-[32px] lg:h-[40px] border border-[#1c4ed1] rounded-full flex items-center justify-center p-[2px] lg:p-[3px]">
                            <div className="w-full h-full bg-[#1c4ed1] rounded-full" />
                        </div>
                        <div className="w-[32px] lg:w-[40px] h-px bg-[#1c4ed1]" />
                        <div className="w-[32px] lg:w-[40px] h-[32px] lg:h-[40px] border border-[#1c4ed1] rounded-full flex items-center justify-center p-[2px] lg:p-[3px]">
                            <div className="w-full h-full bg-[#1c4ed1] rounded-full" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Form Sections */}
            <div className="flex flex-col gap-[40px] max-w-[560px] xl:max-w-[677px] mx-auto w-full pb-[40px]">

                <div className="flex flex-col gap-[32px]">
                    <h2 className="text-brand-navy text-[20px] font-semibold">Collaboration Lead</h2>

                    {/* Full Name */}
                    <div className="flex flex-col gap-[16px]">
                        <label className="text-brand-body text-[18px] font-semibold tracking-tight">Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => onUpdateFullName(e.target.value)}
                            placeholder="Enter your full name"
                            className="w-full h-[64px] bg-brand-bg border border-brand-stroke rounded-[16px] px-[20px] text-brand-body font-medium outline-none focus:border-[#1c4ed1] transition-colors"
                        />
                    </div>

                    {/* Email Address */}
                    <div className="flex flex-col gap-[16px]">
                        <label className="text-brand-body text-[18px] font-semibold tracking-tight">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => onUpdateEmail(e.target.value)}
                            placeholder="Enter your email address"
                            className="w-full h-[64px] bg-brand-bg border border-brand-stroke rounded-[16px] px-[20px] text-brand-body font-medium outline-none focus:border-[#1c4ed1] transition-colors"
                        />
                    </div>

                    {/* Phone Number */}
                    <div className="flex flex-col gap-[16px]">
                        <label className="text-brand-body text-[18px] font-semibold tracking-tight">Phone Number</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => onUpdatePhone(e.target.value)}
                            placeholder="Enter your phone number"
                            className="w-full h-[64px] bg-brand-bg border border-brand-stroke rounded-[16px] px-[20px] text-brand-body font-medium outline-none focus:border-[#1c4ed1] transition-colors"
                        />
                    </div>
                </div>

                {/* Request Design Evolution: Optional First Brief */}
                <div className="bg-brand-bg p-[24px] lg:p-[32px] rounded-[24px] flex flex-col gap-[24px]">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-[8px]">
                            <h3 className="text-brand-navy text-[20px] font-semibold tracking-tight leading-tight">Request your first design</h3>
                            <p className="text-brand-body text-[14px] font-medium opacity-70">
                                Optional: Describe your first project now to jumpstart your subscription.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowFirstRequest(!showFirstRequest)}
                            className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer",
                                showFirstRequest ? "bg-white text-brand-blue border border-brand-stroke" : "bg-brand-blue text-white"
                            )}
                        >
                            {showFirstRequest ? <Minus size={20} /> : <Plus size={20} />}
                        </button>
                    </div>

                    <AnimatePresence>
                        {showFirstRequest && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="flex flex-col gap-[16px] pt-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-brand-navy text-[14px] font-bold">Project Title</label>
                                        <input
                                            type="text"
                                            value={firstRequestTitle}
                                            onChange={(e) => onUpdateFirstRequestTitle(e.target.value)}
                                            placeholder="e.g. Modern Logo Redesign"
                                            className="w-full h-[52px] bg-white border border-brand-stroke rounded-[12px] px-[16px] text-brand-body font-medium outline-none focus:border-brand-blue"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-brand-navy text-[14px] font-bold">Design Brief</label>
                                        <textarea
                                            value={firstRequestDesc}
                                            onChange={(e) => onUpdateFirstRequestDesc(e.target.value)}
                                            placeholder="Describe what you need us to create..."
                                            className="w-full h-[120px] bg-white border border-brand-stroke rounded-[12px] p-[16px] text-brand-body font-medium outline-none focus:border-brand-blue resize-none premium-scrollbar"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Hidden legacy Request Tracker Section */}
                    <div className="hidden">
                        <p>{designCount} designs used</p>
                    </div>
                </div>

                {/* Referral Section */}
                <div className="bg-brand-bg p-[32px] rounded-[24px] flex flex-col gap-[20px]">
                    <div className="flex items-center justify-between gap-[16px]">
                        <div className="flex items-center gap-[24px]">
                            <div className="w-[64px] h-[64px] bg-[#EEF2FF] rounded-[16px] flex items-center justify-center shrink-0">
                                <Gift className="text-[#4F46E5]" size={32} strokeWidth={1.5} />
                            </div>
                            <div className="flex flex-col gap-[8px]">
                                <h3 className="text-brand-navy text-[20px] font-semibold tracking-[-0.2px]">Were you referred?</h3>
                                <p className="text-brand-body text-[14px] font-medium tracking-[-0.14px]">Enter your referral code for a bonus</p>
                            </div>
                        </div>

                        {/* Figma Style Toggle */}
                        <button
                            onClick={() => onUpdateIsReferred(!isReferred)}
                            className={cn(
                                "w-[66px] h-[36px] rounded-full p-[3px] transition-all duration-300 relative cursor-pointer",
                                isReferred ? "bg-[#1c4ed1]" : "bg-[#DFE1E7]"
                            )}
                        >
                            <div className={cn(
                                "w-[30px] h-[30px] bg-white rounded-full shadow-sm transition-all duration-300 transform",
                                isReferred ? "translate-x-[30px]" : "translate-x-0"
                            )} />
                        </button>
                    </div>

                    <AnimatePresence>
                        {isReferred && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="pt-2 flex flex-col gap-2">
                                    <input
                                        type="text"
                                        value={referralCode}
                                        onChange={(e) => onUpdateReferralCode(e.target.value)}
                                        placeholder="Enter Referral Code"
                                        className={cn(
                                            "w-full h-[64px] bg-white border rounded-[16px] px-[20px] text-brand-navy font-bold outline-none transition-all",
                                            referralCode && !referralStatus.loading && (referralStatus.valid ? "border-green-500 bg-green-50/10" : "border-red-500 bg-red-50/10"),
                                            !referralCode && "border-brand-stroke focus:border-brand-blue"
                                        )}
                                    />
                                    {referralStatus.loading && (
                                        <span className="text-[12px] text-brand-body animate-pulse px-1">Verifying code...</span>
                                    )}
                                    {referralCode && !referralStatus.loading && referralStatus.valid && (
                                        <span className="text-[12px] text-green-600 font-bold px-1">✓ Valid code! Referred by {referralStatus.name}</span>
                                    )}
                                    {referralCode && !referralStatus.loading && !referralStatus.valid && referralCode.length >= 4 && (
                                        <span className="text-[12px] text-red-500 font-bold px-1">✗ Referral code not found</span>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Portfolio Section (Mobile/Tablet Only - Hidden on LG+ as it's in the sidebar) */}
                <div className="lg:hidden bg-white p-[24px] lg:p-[32px] rounded-[24px] border border-brand-stroke/50 shadow-sm">
                    <PortfolioViewer />
                </div>

                {/* Activate Subscription Button */}
                <button
                    onClick={onActivate}
                    disabled={!fullName || !email}
                    className={cn(
                        "w-full h-[48px] lg:h-[52px] rounded-full flex items-center justify-center text-white text-[18px] font-medium transition-all shadow-md cursor-pointer",
                        (fullName && email)
                            ? "bg-[#0A4FE8] hover:brightness-110"
                            : "bg-[#1c4ed1] opacity-50 cursor-not-allowed"
                    )}
                >
                    Activate Subscription
                </button>
            </div>
        </div>
    );
};
