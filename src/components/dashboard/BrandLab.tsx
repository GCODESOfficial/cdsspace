"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { getCountries, getStates, getCities, type Country } from "@/lib/actions/location";
import { unifiedSearchAddress as searchAddress, type MapboxFeature } from "@/lib/actions/address-provider";
import { BrandLabSuccessModal } from "./BrandLabSuccessModal";
import { StudioPreview } from "./shared/StudioPreview";
import { CheckCircle2, Minus, Plus } from "lucide-react";
import { AssetHub, AssetFile } from "../shared/AssetHub";

interface BrandLabProps {
    onBack: () => void;
}

type Step = 1 | 2 | 3 | 4;

interface FormData {
    projectName: string;
    deadline: string;
    brandFiles: File[];
    designFiles: File[];
    color: string;
    customHex: string;
    placement: "Front" | "Back" | "Sleeve";
    printMethod: "Screen Print" | "Embroidery" | "Laser Engrave";
    quantities: {
        S: number;
        M: number;
        L: number;
        XL: number;
        XXL: number;
    };
    fulfillmentType: "Door-to-door" | "Pickup Station";
    shipping: {
        country: string;
        state: string;
        city: string;
        streetAddress: string;
        recipientName: string;
        phoneNumber: string;
        instructions: string;
        pickupStation: string;
    };
}



/**
 * BrandLab - 1:1 Figma Implementation of the multi-step Merch configuration flow.
 * Refined for 1300px desktop and mobile responsiveness with unified state.
 */
export const BrandLab = ({ onBack }: BrandLabProps) => {
    const [step, setStep] = useState<Step>(1);
    const [formData, setFormData] = useState<FormData>({
        projectName: "",
        deadline: "",
        brandFiles: [],
        designFiles: [],
        color: "#F4F6FB",
        customHex: "",
        placement: "Front",
        printMethod: "Screen Print",
        quantities: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
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
        }
    });

    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const brandFileInputRef = useRef<HTMLInputElement>(null);
    const designFileInputRef = useRef<HTMLInputElement>(null);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

    // --- State Handlers ---

    const updateFormData = (updates: Partial<FormData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    };

    const handleQuantityChange = (size: keyof FormData["quantities"], delta: number) => {
        setFormData(prev => ({
            ...prev,
            quantities: {
                ...prev.quantities,
                [size]: Math.max(0, prev.quantities[size] + delta)
            }
        }));
    };

    const totalUnits = Object.values(formData.quantities).reduce((a, b) => a + b, 0);

    // --- Location States ---
    const [availableCountries, setAvailableCountries] = useState<Country[]>([]);
    const [availableStates, setAvailableStates] = useState<string[]>([]);
    const [availableCities, setAvailableCities] = useState<string[]>([]);
    const [isLoadingLocations, setIsLoadingLocations] = useState(false);
    const [addressResults, setAddressResults] = useState<MapboxFeature[]>([]);
    const [isSearchingAddress, setIsSearchingAddress] = useState(false);
    const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);

    // Initial load: Countries
    useEffect(() => {
        const loadCountries = async () => {
            setIsLoadingLocations(true);
            const countries = await getCountries();
            setAvailableCountries(countries);
            setIsLoadingLocations(false);
        };
        loadCountries();
    }, []);

    // Effect: Country -> States
    useEffect(() => {
        if (!formData.shipping.country) {
            setAvailableStates([]);
            return;
        }
        const loadStates = async () => {
            setIsLoadingLocations(true);
            const states = await getStates(formData.shipping.country);
            setAvailableStates(states);
            setIsLoadingLocations(false);
        };
        loadStates();
    }, [formData.shipping.country]);

    // Effect: State -> Cities
    useEffect(() => {
        if (!formData.shipping.country || !formData.shipping.state) {
            setAvailableCities([]);
            return;
        }
        const loadCities = async () => {
            setIsLoadingLocations(true);
            const cities = await getCities(formData.shipping.country, formData.shipping.state);
            setAvailableCities(cities);
            setIsLoadingLocations(false);
        };
        loadCities();
    }, [formData.shipping.country, formData.shipping.state]);

    // Handle Address Search
    const handleAddressSearch = async (query: string) => {
        updateFormData({ shipping: { ...formData.shipping, streetAddress: query } });

        if (query.length < 3) {
            setAddressResults([]);
            setShowAddressSuggestions(false);
            return;
        }

        setIsSearchingAddress(true);
        setShowAddressSuggestions(true);

        // Find ISO code for localized search
        const selectedCountry = availableCountries.find(c => c.name === formData.shipping.country);

        const results = await searchAddress(
            query,
            selectedCountry?.iso2,
            formData.shipping.state,
            formData.shipping.city
        );

        setAddressResults(results);
        setIsSearchingAddress(false);
    };

    const selectAddress = (addr: MapboxFeature) => {
        updateFormData({ shipping: { ...formData.shipping, streetAddress: addr.place_name } });
        setAddressResults([]);
        setShowAddressSuggestions(false);

        // Optionally extract state/city from context if possible
        if (addr.context) {
            const cityContext = addr.context.find((c: any) => c.id.startsWith('place'));
            const stateContext = addr.context.find((c: any) => c.id.startsWith('region'));

            if (cityContext || stateContext) {
                // We could auto-fill these if they are in our available lists
            }
        }
    };

    // --- File Handlers ---

    // Handlers moved to AssetHub

    // --- Color Presets ---
    const presets = [
        { name: "White", hex: "#FFFFFF" },
        { name: "Black", hex: "#000000" },
        { name: "Navy", hex: "#1e3a8a" },
        { name: "Red", hex: "#dc2626" },
        { name: "Green", hex: "#16a34a" },
        { name: "Purple", hex: "#9333ea" },
        { name: "Cyan", hex: "#06b6d4" },
        { name: "Yellow", hex: "#ffcd00" },
    ];

    const printMethods = [
        { id: "Screen Print", label: "Screen Print", sub: "Vibrant durable colors" },
        { id: "Embroidery", label: "Embroidery", sub: "Premium textured finish" },
        { id: "Laser Engrave", label: "Laser Engrave", sub: "Precise permanent marking" },
    ] as const;

    return (
        <div className="flex flex-col lg:flex-row gap-5 xl:gap-8 w-full h-full min-h-0 premium-scrollbar overflow-y-auto lg:overflow-hidden p-4 lg:p-0 bg-white">
            {/* Left Content Area - Form */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex-1 bg-white rounded-[24px] lg:rounded-[32px] border border-brand-stroke flex flex-col min-h-0 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)]"
            >
                <div className="flex-1 overflow-y-auto premium-scrollbar p-6 lg:p-10 xl:p-12 relative lg:pb-16">
                    {/* Header */}
                    <div className="relative mb-8 lg:mb-12">
                        <button
                            onClick={step === 1 ? onBack : () => setStep(prev => (prev - 1) as Step)}
                            className="absolute left-[-10px] lg:left-[-16px] xl:left-[-24px] top-1 p-2 hover:bg-brand-bg rounded-xl transition-all group z-10"
                        >
                            <Image
                                src="/dashboard/subscription/arrow-left-02.svg"
                                alt="Back"
                                width={32}
                                height={32}
                                className="w-6 h-6 lg:w-8 lg:h-8 opacity-60 group-hover:opacity-100 transition-opacity"
                            />
                        </button>

                        <div className="flex flex-col items-center text-center max-w-2xl mx-auto gap-2">
                            <h2 className="text-brand-navy text-[20px] lg:text-[24px] xl:text-[32px] font-bold tracking-tight">
                                The Brand Lab
                            </h2>
                            <p className="text-brand-body text-[13px] lg:text-[15px] xl:text-[16px] font-medium max-w-[580px] leading-relaxed mx-auto">
                                Configure premium merch, experiment with placements, and see your brand in 360° before we go to print
                            </p>
                        </div>
                    </div>

                    {/* Stepper - All blue for active/passed steps */}
                    <div className="flex items-center justify-center gap-2 lg:gap-3 xl:gap-4 mb-10 lg:mb-16">
                        {[1, 2, 3, 4].map((s) => (
                            <React.Fragment key={s}>
                                <div className={cn(
                                    "w-8 h-8 lg:w-[40px] lg:h-[40px] rounded-full flex items-center justify-center transition-all duration-500 relative shrink-0",
                                    step >= s ? "border-[#1c4ed1]" : "border-[#c8d1e0]",
                                    "border"
                                )}>
                                    <div className={cn(
                                        "w-[24px] h-[24px] lg:w-[32px] lg:h-[32px] rounded-full transition-all duration-500 p-[2px] lg:p-[3px]",
                                        step >= s ? "bg-[#1c4ed1]" : "bg-[#c8d1e0] opacity-40"
                                    )}>
                                        <div className={cn(
                                            "w-full h-full rounded-full",
                                            step >= s ? "bg-[#1c4ed1]" : "bg-[#c8d1e0]"
                                        )} />
                                    </div>
                                    {step === s && (
                                        <div className="absolute inset-[-4px] rounded-full border border-brand-blue/30 animate-pulse lg:inset-[-6px]" />
                                    )}
                                </div>
                                {s < 4 && (
                                    <div className={cn(
                                        "w-6 lg:w-[40px] h-px transition-all duration-500",
                                        step > s ? "bg-[#1c4ed1]" : "bg-[#c8d1e0] opacity-40"
                                    )} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Step Content Wrapper - Centered column for form elements */}
                    <div className="max-w-[540px] md:max-w-[677px] xl:max-w-[720px] mx-auto w-full">
                        <AnimatePresence mode="wait">
                            {step === 1 && (
                                <motion.div
                                    key="step1"
                                    initial={{ opacity: 0, x: -15 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 15 }}
                                    className="space-y-8 lg:space-y-10"
                                >
                                    <div className="space-y-2">
                                        <h3 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Project Identity</h3>
                                    </div>

                                    <div className="space-y-6 lg:space-y-8">
                                        {/* Project Name */}
                                        <div className="flex flex-col gap-3 lg:gap-4">
                                            <label className="text-brand-body text-[14px] lg:text-[18px] font-semibold">Project Name</label>
                                            <input
                                                type="text"
                                                value={formData.projectName}
                                                onChange={(e) => updateFormData({ projectName: e.target.value })}
                                                placeholder="Enter project name"
                                                className="w-full h-14 lg:h-16 px-6 bg-brand-bg border border-brand-stroke rounded-[16px] outline-none focus:border-brand-blue/30 focus:bg-white transition-all font-medium text-brand-navy"
                                            />
                                        </div>

                                        {/* Calendar / Deadline */}
                                        <div className="flex flex-col gap-3 lg:gap-4 relative">
                                            <label className="text-brand-body text-[14px] lg:text-[18px] font-semibold">Target Deadline</label>
                                            <div
                                                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                                                className="w-full h-14 lg:h-16 px-6 bg-brand-bg border border-brand-stroke rounded-[16px] flex items-center justify-between cursor-pointer hover:bg-brand-bg/80 transition-all select-none"
                                            >
                                                <span className={cn("font-medium", formData.deadline ? "text-brand-navy" : "text-brand-mute")}>
                                                    {formData.deadline || "mm/dd/yyyy"}
                                                </span>
                                                <Image src="/dashboard/subscription/calendar-02.svg" alt="Calendar" width={24} height={24} className="opacity-60" />
                                            </div>

                                            {isCalendarOpen && (
                                                <div className="absolute top-[105%] left-0 z-50 bg-white border border-brand-stroke rounded-2xl shadow-xl p-4 w-full md:w-[320px] animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <input
                                                        type="date"
                                                        autoFocus
                                                        className="w-full p-2 border rounded-xl"
                                                        onChange={(e) => {
                                                            updateFormData({ deadline: e.target.value });
                                                            setIsCalendarOpen(false);
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* File Upload Zone - Replicated from BrandIntelligence */}
                                        <div className="flex flex-col gap-3 lg:gap-4">
                                            <label className="text-brand-body text-[14px] lg:text-[18px] font-semibold">Brand Guideline</label>
                                            <AssetHub
                                                files={formData.brandFiles as AssetFile[]}
                                                onUpdateFiles={(files) => updateFormData({ brandFiles: files })}
                                                maxFiles={5}
                                                title="Drop brand guidelines here"
                                                description="SVG, PNG, JPG (max. 10MB)"
                                                icon="upload"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setStep(2)}
                                        className="w-full h-14 lg:h-16 rounded-full flex items-center justify-center text-white text-[18px] font-medium shadow-lg hover:scale-[1.01] transition-all bg-[#0A4FE8]"
                                    >
                                        Next
                                    </button>
                                </motion.div>
                            )}

                            {step === 2 && (
                                <motion.div
                                    key="step2"
                                    initial={{ opacity: 0, x: -15 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 15 }}
                                    className="space-y-10 lg:space-y-12"
                                >
                                    <div className="space-y-4">
                                        <h3 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Product Configurator</h3>
                                    </div>

                                    <div className="space-y-10 lg:space-y-12">
                                        {/* Color & Hex */}
                                        <div className="flex gap-4 lg:gap-6 items-end">
                                            <div className="flex flex-col gap-3">
                                                <label className="text-brand-body text-[14px] lg:text-[18px] font-semibold">Color</label>
                                                <div
                                                    className="size-14 lg:size-16 rounded-[16px] border border-brand-stroke shadow-sm transition-colors duration-300"
                                                    style={{ backgroundColor: formData.color }}
                                                />
                                            </div>
                                            <div className="flex-1 flex flex-col gap-3">
                                                <label className="text-brand-body text-[14px] lg:text-[18px] font-semibold">Hex Code</label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={formData.customHex || formData.color}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                customHex: val,
                                                                color: val.length >= 4 ? (val.startsWith('#') ? val : `#${val}`) : prev.color
                                                            }));
                                                        }}
                                                        placeholder="#0035C1"
                                                        className="w-full h-14 lg:h-16 px-6 bg-brand-bg border border-brand-stroke rounded-[16px] outline-none transition-all font-medium text-brand-navy"
                                                    />
                                                    {formData.color.length >= 4 && (
                                                        <CheckCircle2 className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-blue/40" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Presets */}
                                        <div className="space-y-4">
                                            <label className="text-brand-body text-[14px] lg:text-[18px] font-semibold">Quick Presets</label>
                                            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 lg:gap-4">
                                                {presets.map((p) => (
                                                    <button
                                                        key={p.hex}
                                                        onClick={() => updateFormData({ color: p.hex, customHex: p.hex })}
                                                        className={cn(
                                                            "size-12 lg:size-14 xl:size-16 rounded-[16px] border transition-all hover:scale-110",
                                                            formData.color.toLowerCase() === p.hex.toLowerCase() ? "border-brand-blue ring-2 ring-brand-blue/20" : "border-brand-stroke"
                                                        )}
                                                        style={{ backgroundColor: p.hex }}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        {/* Quantities */}
                                        <div className="space-y-4 pt-4 border-t border-brand-stroke">
                                            <label className="text-brand-body text-[14px] lg:text-[18px] font-semibold">Size Quantities</label>
                                            <div className="bg-brand-bg rounded-[24px] border border-brand-stroke p-5 lg:p-8">
                                                <div className="flex justify-between text-center mb-8 px-2">
                                                    {["S", "M", "L", "XL", "XXL"].map(size => (
                                                        <span key={size} className="text-brand-body font-bold text-[14px] lg:text-[18px] w-full">{size}</span>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-5 gap-3 lg:gap-6">
                                                    {(["S", "M", "L", "XL", "XXL"] as const).map(size => (
                                                        <div key={size} className="bg-white rounded-xl border border-brand-stroke flex items-center justify-between p-1 lg:p-1.5 h-10 lg:h-12 shadow-sm">
                                                            <button
                                                                onClick={() => handleQuantityChange(size, -1)}
                                                                className="size-6 lg:size-8 bg-brand-bg rounded-full flex items-center justify-center text-brand-body hover:bg-brand-stroke transition-colors shrink-0"
                                                            >
                                                                <Minus className="w-3.5 h-3.5" />
                                                            </button>
                                                            <span className="font-bold text-brand-navy text-[14px] lg:text-[18px]">{formData.quantities[size]}</span>
                                                            <button
                                                                onClick={() => handleQuantityChange(size, 1)}
                                                                className="size-6 lg:size-8 bg-brand-blue rounded-full flex items-center justify-center text-white hover:brightness-110 transition-all shrink-0"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="mt-4 flex items-center justify-start gap-2 text-brand-body font-medium text-sm">
                                                <span>Total Units:</span>
                                                <span className="text-brand-navy font-bold">{totalUnits}</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-4 pt-4 pb-8 lg:pb-0">
                                            <button
                                                onClick={() => setStep(1)}
                                                className="flex-1 h-14 lg:h-16 border-2 border-brand-blue rounded-full text-brand-blue font-bold hover:bg-brand-blue/5 transition-all text-[16px] lg:text-[18px]"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                onClick={() => setStep(3)}
                                                className="flex-[1.2] h-14 lg:h-16 rounded-full text-white font-bold transition-all hover:scale-[1.01] bg-[#0A4FE8] text-[16px] lg:text-[18px]"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {step === 3 && (
                                <motion.div
                                    key="step3"
                                    initial={{ opacity: 0, x: -15 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 15 }}
                                    className="space-y-10 lg:space-y-12"
                                >
                                    <div className="space-y-4">
                                        <h3 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Design Studio</h3>
                                    </div>

                                    <div className="space-y-10 lg:space-y-12">
                                        {/* Design Files Upload */}
                                        <div className="flex flex-col gap-4">
                                            <label className="text-brand-body text-[16px] lg:text-[18px] font-semibold tracking-tight">Design Files</label>
                                            <AssetHub
                                                files={formData.designFiles as AssetFile[]}
                                                onUpdateFiles={(files) => updateFormData({ designFiles: files })}
                                                maxFiles={10}
                                                acceptedTypes=".svg,.ai,.eps,.pdf"
                                                title="Drop design files here"
                                                description="SVG, AI, EPS, PDF (Max 10MB)"
                                                icon="folder"
                                            />
                                        </div>

                                        {/* Design Placement */}
                                        <div className="space-y-4">
                                            <label className="text-brand-body text-[16px] lg:text-[18px] font-semibold">Design Placement</label>
                                            <div className="flex gap-4">
                                                {(["Front", "Back", "Sleeve"] as const).map(p => (
                                                    <button
                                                        key={p}
                                                        onClick={() => updateFormData({ placement: p })}
                                                        className={cn(
                                                            "flex-1 h-12 lg:h-14 rounded-[12px] border font-medium text-[14px] lg:text-[16px] transition-all",
                                                            formData.placement === p
                                                                ? "bg-brand-blue/10 border-brand-blue stext-brand-blue font-bold shadow-xs"
                                                                : "border-[#e3e8f4] text-brand-body hover:bg-brand-bg"
                                                        )}
                                                    >
                                                        {p}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2 text-brand-mute text-[12px] pt-1">
                                                <Image src="/dashboard/merch/info-circle.svg" alt="Info" width={16} height={16} className="opacity-40" />
                                                <span className="font-medium">Placement options vary by product type</span>
                                            </div>
                                        </div>

                                        {/* Print Method */}
                                        <div className="space-y-4">
                                            <label className="text-brand-body text-[16px] lg:text-[18px] font-semibold">Print Method</label>
                                            <div className="flex flex-col gap-3">
                                                {printMethods.map((m) => (
                                                    <button
                                                        key={m.id}
                                                        onClick={() => updateFormData({ printMethod: m.id as any })}
                                                        className={cn(
                                                            "w-full p-5 lg:p-6 border rounded-[20px] flex items-center gap-5 transition-all text-left shadow-xs",
                                                            formData.printMethod === m.id
                                                                ? "border-brand-blue bg-white"
                                                                : "border-[#e3e8f4] hover:border-brand-blue/20 bg-brand-bg/50 hover:bg-white"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all",
                                                            formData.printMethod === m.id ? "border-brand-blue bg-brand-blue" : "border-[#e3e8f4]"
                                                        )}>
                                                            {formData.printMethod === m.id && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className={cn("text-[15px] lg:text-[17px] font-bold", formData.printMethod === m.id ? "text-brand-navy" : "text-brand-body")}>
                                                                {m.label}
                                                            </span>
                                                            <span className="text-[11px] lg:text-[13px] text-brand-mute font-medium">{m.sub}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-4 pt-4 pb-8 lg:pb-0">
                                            <button
                                                onClick={() => setStep(2)}
                                                className="flex-1 h-14 lg:h-16 border-2 border-brand-blue rounded-full text-brand-blue font-bold hover:bg-brand-blue/5 transition-all text-[16px] lg:text-[18px]"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                onClick={() => setStep(4)}
                                                className="flex-[1.2] h-14 lg:h-16 rounded-full text-white font-bold transition-all hover:scale-[1.01] bg-[#0A4FE8] text-[16px] lg:text-[18px]"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                            {step === 4 && (
                                <motion.div
                                    key="step4"
                                    initial={{ opacity: 0, x: -15 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 15 }}
                                    className="space-y-10 lg:space-y-12"
                                >
                                    <div className="space-y-4">
                                        <h3 className="text-brand-navy text-[18px] lg:text-[20px] font-bold">Shipping & Fulfillment</h3>
                                    </div>

                                    <div className="space-y-10">
                                        {/* Fulfillment Type Selection */}
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <button
                                                    onClick={() => updateFormData({ fulfillmentType: "Door-to-door" })}
                                                    className={cn(
                                                        "flex flex-col items-center justify-center py-6 px-10 rounded-[16px] border border-solid transition-all gap-4 text-center group w-full",
                                                        formData.fulfillmentType === "Door-to-door"
                                                            ? "bg-[rgba(28,78,209,0.08)] border-[#1c4ed1]"
                                                            : "bg-white border-[#e3e8f4] hover:bg-brand-bg/20"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "size-[40px] rounded-[8px] flex items-center justify-center transition-all",
                                                        formData.fulfillmentType === "Door-to-door" ? "bg-[rgba(28,78,209,0.16)]" : "bg-[rgba(28,78,209,0.04)]"
                                                    )}>
                                                        <Image
                                                            src="/dashboard/merch/van.svg"
                                                            alt="D2D"
                                                            width={24}
                                                            height={24}
                                                            className={cn("transition-all", formData.fulfillmentType === "Door-to-door" ? "" : "opacity-60")}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className={cn("text-[16px] font-medium tracking-[-0.16px]", formData.fulfillmentType === "Door-to-door" ? "text-[#1c4ed1]" : "text-[#4b5563]")}>Door-to-door</p>
                                                        <p className={cn("text-[10px] tracking-[-0.1px] font-medium opacity-60", formData.fulfillmentType === "Door-to-door" ? "text-[#1c4ed1]" : "text-brand-mute")}>Direct delivery</p>
                                                    </div>
                                                </button>

                                                <button
                                                    onClick={() => updateFormData({ fulfillmentType: "Pickup Station" })}
                                                    className={cn(
                                                        "flex flex-col items-center justify-center py-6 px-10 rounded-[16px] border border-solid transition-all gap-4 text-center group w-full",
                                                        formData.fulfillmentType === "Pickup Station"
                                                            ? "bg-[rgba(28,78,209,0.08)] border-[#1c4ed1]"
                                                            : "bg-white border-[#e3e8f4] hover:bg-brand-bg/20"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "size-[40px] rounded-[8px] flex items-center justify-center transition-all",
                                                        formData.fulfillmentType === "Pickup Station" ? "bg-[rgba(28,78,209,0.16)]" : "bg-[rgba(28,78,209,0.04)]"
                                                    )}>
                                                        <Image
                                                            src="/dashboard/merch/location-01.svg"
                                                            alt="Pickup"
                                                            width={24}
                                                            height={24}
                                                            className={cn("transition-all", formData.fulfillmentType === "Pickup Station" ? "invert-27 sepia-97 saturate-1752 hue-rotate-209 brightness-88 contrast-92" : "opacity-60")}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className={cn("text-[16px] font-medium tracking-[-0.16px]", formData.fulfillmentType === "Pickup Station" ? "text-[#1c4ed1]" : "text-[#4b5563]")}>Pickup Station</p>
                                                        <p className={cn("text-[10px] tracking-[-0.1px] font-medium opacity-60", formData.fulfillmentType === "Pickup Station" ? "text-[#1c4ed1]" : "text-brand-mute")}>Save on fees</p>
                                                    </div>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Dynamic Form Fields */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                                            {/* Country Selection */}
                                            <div className="md:col-span-2 space-y-2 lg:space-y-3">
                                                <label className="text-brand-body text-[14px] lg:text-[16px] font-bold">Country <span className="text-red-500">*</span></label>
                                                <select
                                                    value={formData.shipping.country}
                                                    onChange={(e) => updateFormData({ shipping: { ...formData.shipping, country: e.target.value, state: "", city: "" } })}
                                                    className="w-full h-14 bg-brand-bg border border-brand-stroke rounded-[16px] px-6 outline-none focus:bg-white transition-all font-medium appearance-none cursor-pointer"
                                                >
                                                    <option value="">Select Country</option>
                                                    {availableCountries.map(c => <option key={c.iso2} value={c.name}>{c.name}</option>)}
                                                </select>
                                                {isLoadingLocations && !availableCountries.length && <p className="text-[12px] text-brand-mute animate-pulse">Loading countries...</p>}
                                            </div>

                                            {formData.fulfillmentType === "Door-to-door" ? (
                                                <>
                                                    <div className="space-y-2 lg:space-y-3">
                                                        <label className="text-brand-body text-[14px] lg:text-[16px] font-bold">State <span className="text-red-500">*</span></label>
                                                        <select
                                                            disabled={!formData.shipping.country || isLoadingLocations}
                                                            value={formData.shipping.state}
                                                            onChange={(e) => updateFormData({ shipping: { ...formData.shipping, state: e.target.value, city: "" } })}
                                                            className="w-full h-14 bg-brand-bg border border-brand-stroke rounded-[16px] px-6 outline-none focus:bg-white transition-all font-medium appearance-none cursor-pointer disabled:opacity-50"
                                                        >
                                                            <option value="">{isLoadingLocations && formData.shipping.country ? "Loading..." : "Select State"}</option>
                                                            {availableStates.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2 lg:space-y-3">
                                                        <label className="text-brand-body text-[14px] lg:text-[16px] font-bold">City/LGA <span className="text-red-500">*</span></label>
                                                        <select
                                                            disabled={!formData.shipping.state || isLoadingLocations}
                                                            value={formData.shipping.city}
                                                            onChange={(e) => updateFormData({ shipping: { ...formData.shipping, city: e.target.value } })}
                                                            className="w-full h-14 bg-brand-bg border border-brand-stroke rounded-[16px] px-6 outline-none focus:bg-white transition-all font-medium appearance-none cursor-pointer disabled:opacity-50"
                                                        >
                                                            <option value="">{isLoadingLocations && formData.shipping.state ? "Loading..." : "Select City/LGA"}</option>
                                                            {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="md:col-span-2 space-y-2 lg:space-y-3 relative">
                                                        <label className="text-brand-body text-[14px] lg:text-[16px] font-bold">Street Address <span className="text-red-500">*</span></label>
                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                value={formData.shipping.streetAddress}
                                                                onChange={(e) => handleAddressSearch(e.target.value)}
                                                                placeholder="Enter full street address"
                                                                className="w-full h-14 bg-brand-bg border border-brand-stroke rounded-[16px] px-6 outline-none focus:bg-white transition-all font-medium"
                                                                onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 200)}
                                                                onFocus={() => formData.shipping.streetAddress.length >= 3 && setShowAddressSuggestions(true)}
                                                            />
                                                            {isSearchingAddress && (
                                                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                                    <div className="w-5 h-5 border-2 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin" />
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Address Suggestions Dropdown */}
                                                        <AnimatePresence>
                                                            {showAddressSuggestions && addressResults.length > 0 && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: -10 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    exit={{ opacity: 0, y: -10 }}
                                                                    className="absolute z-50 w-full mt-2 bg-white border border-brand-stroke rounded-[20px] shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto premium-scrollbar"
                                                                >
                                                                    {addressResults.map((result) => (
                                                                        <button
                                                                            key={result.id}
                                                                            onClick={() => selectAddress(result)}
                                                                            className="w-full text-left px-6 py-4 hover:bg-brand-bg transition-colors border-b border-brand-stroke last:border-0 flex flex-col gap-1"
                                                                        >
                                                                            <span className="text-[14px] font-bold text-brand-navy line-clamp-1">{result.text}</span>
                                                                            <span className="text-[12px] text-brand-mute line-clamp-1">{result.place_name}</span>
                                                                        </button>
                                                                    ))}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="md:col-span-2 space-y-2 lg:space-y-3">
                                                    <label className="text-brand-body text-[14px] lg:text-[16px] font-bold">Enter Pickup Station <span className="text-red-500">*</span></label>
                                                    <input
                                                        type="text"
                                                        value={formData.shipping.pickupStation}
                                                        onChange={(e) => updateFormData({ shipping: { ...formData.shipping, pickupStation: e.target.value } })}
                                                        placeholder="Search or enter pickup station"
                                                        className="w-full h-14 bg-brand-bg border border-brand-stroke rounded-[16px] px-6 outline-none focus:bg-white transition-all font-medium"
                                                    />
                                                </div>
                                            )}

                                            <div className="space-y-2 lg:space-y-3">
                                                <label className="text-brand-body text-[14px] lg:text-[16px] font-bold">Recipient Name <span className="text-red-500">*</span></label>
                                                <input
                                                    type="text"
                                                    value={formData.shipping.recipientName}
                                                    onChange={(e) => updateFormData({ shipping: { ...formData.shipping, recipientName: e.target.value } })}
                                                    placeholder="Enter recipient name"
                                                    className="w-full h-14 bg-brand-bg border border-brand-stroke rounded-[16px] px-6 outline-none focus:bg-white transition-all font-medium"
                                                />
                                            </div>
                                            <div className="space-y-2 lg:space-y-3">
                                                <label className="text-brand-body text-[14px] lg:text-[16px] font-bold">Phone Number <span className="text-red-500">*</span></label>
                                                <input
                                                    type="tel"
                                                    value={formData.shipping.phoneNumber}
                                                    onChange={(e) => updateFormData({ shipping: { ...formData.shipping, phoneNumber: e.target.value } })}
                                                    placeholder="Enter phone number"
                                                    className="w-full h-14 bg-brand-bg border border-brand-stroke rounded-[16px] px-6 outline-none focus:bg-white transition-all font-medium"
                                                />
                                            </div>

                                            <div className="space-y-2 lg:space-y-3">
                                                <label className="text-brand-body text-[14px] lg:text-[16px] font-bold">Special Packaging Instructions</label>
                                                <textarea
                                                    value={formData.shipping.instructions}
                                                    onChange={(e) => updateFormData({ shipping: { ...formData.shipping, instructions: e.target.value } })}
                                                    placeholder="Add any specific requirements for packaging or delivery"
                                                    className="w-full min-h-[100px] py-4 bg-brand-bg border border-brand-stroke rounded-[16px] px-6 outline-none focus:bg-white transition-all font-medium resize-none text-[15px]"
                                                />
                                            </div>
                                        </div>

                                        {/* Delivery Cost Estimate Card */}
                                        <div className="bg-[#f4f6fb] border border-[#c8d1e0] rounded-[24px] px-[29px] py-8 space-y-10">
                                            <div className="flex items-center gap-4">
                                                <div className="size-[24px] flex items-center justify-center">
                                                    <Image src="/dashboard/merch/calculator-01.svg" alt="Calculator" width={24} height={24} />
                                                </div>
                                                <h4 className="text-[#4b5563] font-medium text-[16px] lg:text-[18px] tracking-[-0.18px]">Delivery Cost Estimate</h4>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="space-y-6 text-[#4b5563] font-medium">
                                                    {[
                                                        { label: "Location:", value: formData.fulfillmentType === "Door-to-door" ? (`${formData.shipping.city ? formData.shipping.city + ', ' : ''}${formData.shipping.state || "Not Specified"}`) : (formData.shipping.pickupStation || "Not Specified") },
                                                        { label: "Total Units:", value: `${totalUnits} items` },
                                                        { label: "Est. Weight:", value: `${(totalUnits * 0.2).toFixed(1)} kg` },
                                                        { label: "Fulfillment:", value: formData.fulfillmentType },
                                                    ].map((row, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-[12px] lg:text-[14px]">
                                                            <span className="tracking-[-0.14px] opacity-80">{row.label}</span>
                                                            <span className="text-right tracking-[-0.16px]">{row.value}</span>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="space-y-6">
                                                    <div className="h-px bg-[#c8d1e0] w-full" />
                                                    <div className="flex justify-between items-center text-[#4b5563]">
                                                        <span className="font-medium text-[14px] lg:text-[16px] tracking-[-0.16px]">Estimated Delivery:</span>
                                                        <span className="font-semibold text-[18px] tracking-[-0.18px]">₦0</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex flex-col md:flex-row gap-4 pt-4 pb-8 lg:pb-0">
                                            <button
                                                onClick={() => setStep(3)}
                                                className="flex-1 h-14 lg:h-16 border-2 border-brand-blue rounded-full text-brand-blue font-bold hover:bg-brand-blue/5 transition-all text-[16px] lg:text-[18px] order-2 md:order-1"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                onClick={() => setIsSuccessModalOpen(true)}
                                                className="flex-[1.2] h-14 lg:h-16 rounded-full text-white font-bold transition-all hover:scale-[1.01] bg-[#0A4FE8] text-[16px] lg:text-[18px] order-1 md:order-2"
                                            >
                                                Complete Registration
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>

            {/* Right Sidebar - Live Preview (Hyper-optimized for 1300px) */}
            <StudioPreview
                isEmpty={totalUnits === 0}
                statusLabel={totalUnits > 0 ? "Live Preview" : "Mockup Template"}
                footer={
                    <div className="w-full">
                        <div className="bg-brand-bg/40 border border-[#e3e8f4] p-[20px] rounded-[24px] flex items-center justify-between">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-brand-mute text-[10px] font-bold uppercase tracking-[1px]">Status</span>
                                <span className="text-brand-navy text-[16px] font-bold">Step {step} of 4</span>
                            </div>
                            <div className="relative flex items-center justify-center">
                                <svg className="w-12 h-12">
                                    <circle className="text-[#e3e8f4] stroke-current" strokeWidth="3" fill="transparent" r="20" cx="24" cy="24" />
                                    <circle
                                        className="text-brand-blue stroke-current transition-all duration-700"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        fill="transparent"
                                        r="20" cx="24" cy="24"
                                        style={{ strokeDasharray: 125.6, strokeDashoffset: 125.6 - (125.6 * (step / 4)) }}
                                    />
                                </svg>
                                <span className="absolute text-[11px] font-bold text-brand-blue">{Math.round((step / 4) * 100)}%</span>
                            </div>
                        </div>
                    </div>
                }
            >
                <div className="flex flex-col items-center gap-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <motion.div
                        animate={{ backgroundColor: formData.color }}
                        className="w-32 h-32 lg:w-44 lg:h-44 rounded-[40px] flex items-center justify-center shadow-2xl transition-all duration-500 relative ring-8 ring-white/10"
                    >
                        <Image
                            src="/dashboard/subscription/stars.svg"
                            alt="Mockup"
                            width={80}
                            height={80}
                            className={cn("w-20 h-20 opacity-30 transition-colors",
                                formData.color === "#000000" ? "invert opacity-50" : "opacity-30")}
                        />

                        <AnimatePresence>
                            {(formData.designFiles.length > 0 || formData.brandFiles.length > 0) && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={cn(
                                        "absolute bg-white/20 backdrop-blur-md rounded-xl border border-white/40 flex items-center justify-center p-3 shadow-lg transition-all duration-300",
                                        formData.placement === "Front" ? "w-16 h-16 lg:w-20 lg:h-18" :
                                            formData.placement === "Back" ? "w-20 h-20 lg:w-24 lg:h-24 scale-110" :
                                                "w-12 h-12 lg:w-14 lg:h-14 right-4 translate-x-2"
                                    )}
                                >
                                    <CheckCircle2 className="w-full h-full text-white opacity-80" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    <div className="space-y-2 text-center">
                        <p className="text-brand-navy font-bold text-[18px] lg:text-[22px] leading-tight max-w-[300px]">
                            {formData.projectName || "New Merch Project"}
                        </p>
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-center gap-2">
                                <span className="bg-brand-blue/10 text-brand-blue px-2.5 py-0.5 rounded-full text-[10px] lg:text-[11px] font-bold uppercase tracking-wider">{formData.placement}</span>
                                <span className="text-brand-body text-[13px] lg:text-[15px] font-bold">{formData.printMethod}</span>
                            </div>
                            <p className="text-brand-mute text-[12px] lg:text-[14px] font-medium opacity-70">
                                {totalUnits} Units Configured
                            </p>
                        </div>
                    </div>
                </div>
            </StudioPreview>
            {/* Success Celebration Modal */}
            <BrandLabSuccessModal
                isOpen={isSuccessModalOpen}
                onClose={() => {
                    setIsSuccessModalOpen(false);
                    onBack(); // Go back to empty state or dashboard
                }}
            />
        </div>
    );
};
