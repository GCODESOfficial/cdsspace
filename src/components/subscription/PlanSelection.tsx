"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";

type CurrencyCode = "usd" | "ngn" | "rwf";

interface PlanSelectionProps {
    selectedPlanId: string;
    selectedIndustry: string;
    onUpdatePlan: (planId: string) => void;
    onUpdateIndustry: (industry: string) => void;
    onBack: () => void;
    onNext: () => void;
}

interface PricingData {
    price_usd: number;
    price_ngn: number;
    price_rwf: number;
}

const currencyMap: Record<CurrencyCode, string> = {
    usd: "USD",
    ngn: "NGN",
    rwf: "RWF",
};

const plans = [
    {
        id: "startup",
        name: "Startup",
        subtitle: "5 Designs/month",
        icon: "/dashboard/subscription/energy.svg",
        features: [
            "5 design requests/month",
            "36-hour turnaround",
            "Unlimited revisions"
        ]
    },
    {
        id: "scaleup",
        name: "Scaleup",
        subtitle: "10 Designs/month",
        icon: "/dashboard/subscription/stars.svg",
        features: [
            "10 design requests/month",
            "24-hour turnaround",
            "Unlimited revisions"
        ]
    },
    {
        id: "supreme",
        name: "Supreme",
        subtitle: "Unlimited",
        icon: "/dashboard/subscription/crown-03.svg",
        features: [
            "Unlimited design requests",
            "12-hour turnaround",
            "Unlimited revisions"
        ]
    }
];

const industries = ["Technology", "Blockchain", "Healthcare", "Retail", "Education", "Real Estate", "Fashion", "Beauty", "Other"];

export const PlanSelection = ({
    selectedPlanId,
    selectedIndustry,
    onUpdatePlan,
    onUpdateIndustry,
    onBack,
    onNext
}: PlanSelectionProps) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [pricing, setPricing] = useState<Record<string, PricingData>>({});
    const [currency, setCurrency] = useState<CurrencyCode>("usd");
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch pricing when industry changes
    useEffect(() => {
        if (!selectedIndustry) return;
        const fetchPricing = async () => {
            const { data } = await supabase
                .from("plan_pricing")
                .select("plan, price_usd, price_ngn, price_rwf")
                .eq("industry", selectedIndustry);
            if (data) {
                const map: Record<string, PricingData> = {};
                data.forEach(row => { map[row.plan] = { price_usd: row.price_usd, price_ngn: row.price_ngn, price_rwf: row.price_rwf }; });
                setPricing(map);
            }
        };
        fetchPricing();
    }, [selectedIndustry]);

    // Detect visitor region from server-side IP/country headers and preselect currency.
    useEffect(() => {
        const detectCurrency = async () => {
            try {
                const response = await fetch("/api/currency", { cache: "no-store" });
                if (!response.ok) return;

                const data = await response.json();
                if (data?.currency && data.currency in currencyMap) {
                    setCurrency(data.currency as CurrencyCode);
                }
            } catch (error) {
                console.error("Currency detection failed:", error);
            }
        };

        detectCurrency();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const formatPrice = (value: number) => {
        return new Intl.NumberFormat("en", {
            style: "currency",
            currency: currencyMap[currency],
            currencyDisplay: "code",
            maximumFractionDigits: 0,
        }).format(value);
    };

    const getPrice = (planId: string): string => {
        const p = pricing[planId];
        if (!p) return "Contact us";
        const val = p[`price_${currency}` as keyof PricingData];
        if (!val || val === 0) return "Contact us";
        return formatPrice(Number(val));
    };

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

                    {/* Progress Indicator */}
                    <div className="flex items-center gap-[6px] lg:gap-[8px] mt-[12px] lg:mt-[16px]">
                        <div className="w-[32px] lg:w-[40px] h-[32px] lg:h-[40px] border border-[#1c4ed1] rounded-full flex items-center justify-center p-[2px] lg:p-[3px]">
                            <div className="w-full h-full bg-[#1c4ed1] rounded-full" />
                        </div>
                        <div className="w-[32px] lg:w-[40px] h-px bg-brand-stroke" />
                        <div className="w-[32px] lg:w-[40px] h-[32px] lg:h-[40px] border border-brand-stroke rounded-full" />
                        <div className="w-[32px] lg:w-[40px] h-px bg-brand-stroke" />
                        <div className="w-[32px] lg:w-[40px] h-[32px] lg:h-[40px] border border-brand-stroke rounded-full" />
                    </div>
                </div>
            </div>

            {/* Form */}
            <div className="flex flex-col gap-[32px] lg:gap-[40px] max-w-[560px] xl:max-w-[677px] mx-auto w-full pb-[40px]">

                <div className="flex flex-col gap-[32px]">
                    <h2 className="text-brand-navy text-[20px] font-semibold">Select Your Growth Track</h2>

                    {/* Industry Selector */}
                    <div className="flex flex-col gap-[16px]">
                        <label className="text-brand-body text-[18px] font-semibold tracking-tight">Select Your Industry</label>
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className={cn(
                                    "w-full h-[64px] bg-brand-bg border border-brand-stroke rounded-[16px] px-[20px] flex items-center justify-between transition-all cursor-pointer outline-none",
                                    isDropdownOpen ? "border-brand-blue ring-2 ring-brand-blue/5" : "hover:border-brand-blue/30"
                                )}
                            >
                                <span className={cn("font-medium text-[16px]", selectedIndustry ? "text-brand-navy" : "text-brand-body/40")}>
                                    {selectedIndustry || "Select industry..."}
                                </span>
                                <ChevronDown className={cn("text-brand-body/40 transition-transform duration-300", isDropdownOpen && "rotate-180")} size={20} />
                            </button>

                            <AnimatePresence>
                                {isDropdownOpen && (
                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 5 }} exit={{ opacity: 0, y: -10 }}
                                        className="absolute z-50 w-full bg-white border border-brand-stroke rounded-[16px] shadow-xl p-2 top-full">
                                        <div className="max-h-[240px] overflow-y-auto premium-scrollbar px-1">
                                            {industries.map((industry) => (
                                                <button key={industry}
                                                    onClick={() => { onUpdateIndustry(industry); setIsDropdownOpen(false); }}
                                                    className={cn(
                                                        "w-full text-left px-4 py-3 rounded-[10px] transition-colors font-medium text-[15px] cursor-pointer",
                                                        selectedIndustry === industry ? "bg-brand-blue/5 text-brand-blue" : "text-brand-body hover:bg-brand-bg"
                                                    )}>
                                                    {industry}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Plan Cards */}
                    <div className="flex flex-col gap-[16px]">
                        <div className="flex items-center justify-between">
                            <label className="text-brand-body text-[18px] font-semibold tracking-tight">Choose Your Plan</label>

                            {/* Currency Switcher */}
                            {selectedIndustry && (
                                <div className="flex items-center bg-brand-bg rounded-lg p-0.5 border border-brand-stroke/50">
                                    {(["usd", "ngn", "rwf"] as const).map(c => (
                                        <button key={c} onClick={() => setCurrency(c)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all",
                                                currency === c ? "bg-white text-brand-navy shadow-sm" : "text-brand-mute hover:text-brand-navy"
                                            )}>
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-[16px]">
                            {plans.map((plan) => {
                                const priceLabel = selectedIndustry ? getPrice(plan.id) : plan.subtitle;
                                const hasPrice = selectedIndustry && priceLabel !== "Contact us";

                                return (
                                    <button
                                        key={plan.id}
                                        onClick={() => onUpdatePlan(plan.id)}
                                        className={cn(
                                            "flex flex-col border rounded-[16px] overflow-hidden transition-all text-left group min-h-[276px] cursor-pointer",
                                            selectedPlanId === plan.id
                                                ? "bg-[#E5EDFF] border-brand-blue ring-1 ring-brand-blue"
                                                : "bg-brand-bg border-brand-stroke hover:border-brand-blue/30"
                                        )}
                                    >
                                        <div className="bg-white p-[20px] flex-1 flex flex-col gap-[12px] m-2 rounded-lg">
                                            <div className={cn(
                                                "w-[40px] h-[40px] rounded-lg flex items-center justify-center shrink-0 transition-colors duration-300",
                                                selectedPlanId === plan.id ? "bg-brand-blue" : "bg-brand-bg"
                                            )}>
                                                <Image src={plan.icon} alt={plan.name} width={20} height={20}
                                                    className={cn("transition-all duration-300", selectedPlanId === plan.id ? "brightness-0 invert" : "")} />
                                            </div>
                                            <div className="flex flex-col gap-[2px]">
                                                <span className="text-black text-[18px] font-bold">{plan.name}</span>
                                                {hasPrice ? (
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-brand-blue text-[20px] font-bold">{priceLabel}</span>
                                                        <span className="text-brand-mute text-[11px] font-medium">/mo</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-brand-blue text-[12px] font-semibold">
                                                        {selectedIndustry ? "Contact us" : plan.subtitle}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "p-[20px] flex flex-col gap-[12px] transition-colors duration-300",
                                            selectedPlanId === plan.id ? "bg-[#E5EDFF]" : "bg-brand-bg/50"
                                        )}>
                                            {plan.features.map((feature, idx) => (
                                                <div key={idx} className="flex items-center gap-[8px]">
                                                    <Image src="/dashboard/subscription/tick-01.svg" alt="Tick" width={16} height={16} />
                                                    <span className="text-brand-navy text-[13px] font-medium">{feature}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Next Button */}
                <button
                    onClick={onNext}
                    disabled={!selectedIndustry}
                    className={cn(
                        "w-full h-[48px] lg:h-[52px] rounded-full flex items-center justify-center text-white text-[18px] font-medium transition-all shadow-md cursor-pointer",
                        selectedIndustry
                            ? "bg-[#0A4FE8] hover:brightness-110"
                            : "bg-[#1c4ed1] opacity-50 cursor-not-allowed"
                    )}
                >
                    Next
                </button>
            </div>
        </div>
    );
};
