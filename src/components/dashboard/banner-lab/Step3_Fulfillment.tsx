"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, CheckCircle2, AlertCircle, MapPin, Truck, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { getCountries, getStates, getCities, type Country } from "@/lib/actions/location";
import { unifiedSearchAddress as searchAddress, type MapboxFeature } from "@/lib/actions/address-provider";
import { BannerFormData } from "./types";

interface Step3Props {
    formData: BannerFormData;
    updateFormData: (updates: Partial<BannerFormData>) => void;
    onPrev: () => void;
    onSubmit: () => void;
}

export const Step3_Fulfillment = ({ formData, updateFormData, onPrev, onSubmit }: Step3Props) => {
    // Location state
    const [availableCountries, setAvailableCountries] = useState<Country[]>([]);
    const [availableStates, setAvailableStates] = useState<string[]>([]);
    const [availableCities, setAvailableCities] = useState<string[]>([]);
    const [isLoadingLocations, setIsLoadingLocations] = useState(false);

    // Address Search state
    const [isSearchingAddress, setIsSearchingAddress] = useState(false);
    const [addressResults, setAddressResults] = useState<MapboxFeature[]>([]);
    const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);

    // Initialize Countries
    useEffect(() => {
        const fetchCountries = async () => {
            setIsLoadingLocations(true);
            try {
                const countries = await getCountries();
                setAvailableCountries(countries);
            } catch (error) {
                console.error("Failed to fetch countries:", error);
            } finally {
                setIsLoadingLocations(false);
            }
        };
        fetchCountries();
    }, []);

    // Fetch States when Country changes
    useEffect(() => {
        const fetchStates = async () => {
            if (!formData.shipping.country) return;
            setIsLoadingLocations(true);
            try {
                const states = await getStates(formData.shipping.country);
                setAvailableStates(states);
            } catch (error) {
                console.error("Failed to fetch states:", error);
            } finally {
                setIsLoadingLocations(false);
            }
        };
        fetchStates();
    }, [formData.shipping.country]);

    // Fetch Cities when State changes
    useEffect(() => {
        const fetchCities = async () => {
            if (!formData.shipping.state || !formData.shipping.country) return;
            setIsLoadingLocations(true);
            try {
                const cities = await getCities(formData.shipping.country, formData.shipping.state);
                setAvailableCities(cities);
            } catch (error) {
                console.error("Failed to fetch cities:", error);
            } finally {
                setIsLoadingLocations(false);
            }
        };
        fetchCities();
    }, [formData.shipping.state, formData.shipping.country]);

    const handleAddressSearch = async (query: string) => {
        updateFormData({ shipping: { ...formData.shipping, streetAddress: query } });
        if (query.length < 3) {
            setAddressResults([]);
            setShowAddressSuggestions(false);
            return;
        }

        setIsSearchingAddress(true);
        try {
            const results = await searchAddress(query);
            setAddressResults(results);
            setShowAddressSuggestions(true);
        } catch (error) {
            console.error("Address search failed:", error);
        } finally {
            setIsSearchingAddress(false);
        }
    };

    const selectAddress = (result: MapboxFeature) => {
        updateFormData({ shipping: { ...formData.shipping, streetAddress: result.text } });
        setShowAddressSuggestions(false);
    };

    const handleQuantityChange = (delta: number) => {
        const currentQty = typeof formData.quantity === "string" ? (parseInt(formData.quantity) || 0) : formData.quantity;
        updateFormData({ quantity: Math.max(1, currentQty + delta) });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6 xl:space-y-8 2xl:space-y-12"
        >
            <div className="space-y-3 xl:space-y-4">
                <h3 className="text-brand-navy text-[15px] xl:text-[16px] 2xl:text-[20px] font-bold">Production & Shipping</h3>
            </div>

            <div className="space-y-6 xl:space-y-8 2xl:space-y-10">
                {/* Fulfillment Type Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 2xl:gap-4">
                    <button
                        onClick={() => updateFormData({ fulfillmentType: "Door-to-door" })}
                        className={cn(
                            "flex flex-col items-center justify-center py-4 xl:py-5 2xl:py-8 rounded-[14px] 2xl:rounded-[24px] border-2 transition-all gap-2 xl:gap-3 2xl:gap-4 text-center group",
                            formData.fulfillmentType === "Door-to-door"
                                ? "bg-[#F0F5FF]/50 border-brand-blue"
                                : "bg-white border-brand-stroke hover:border-brand-blue/30"
                        )}
                    >
                        <div className={cn(
                            "size-8 xl:size-10 2xl:size-12 rounded-lg xl:rounded-xl flex items-center justify-center transition-all",
                            formData.fulfillmentType === "Door-to-door" ? "bg-brand-blue/20 text-brand-blue" : "bg-brand-bg text-brand-mute"
                        )}>
                            <Truck className="size-4 xl:size-5 2xl:size-6" />
                        </div>
                        <div className="space-y-0.5">
                            <p className={cn("text-[13px] xl:text-[14px] 2xl:text-[16px] font-bold", formData.fulfillmentType === "Door-to-door" ? "text-brand-blue" : "text-brand-navy")}>Door-to-door</p>
                            <p className="text-[9px] xl:text-[10px] 2xl:text-[11px] font-medium text-brand-mute px-2">Direct delivery to your doorstep</p>
                        </div>
                    </button>

                    <button
                        onClick={() => updateFormData({ fulfillmentType: "Pickup Station" })}
                        className={cn(
                            "flex flex-col items-center justify-center py-4 xl:py-5 2xl:py-8 rounded-[14px] 2xl:rounded-[24px] border-2 transition-all gap-2 xl:gap-3 2xl:gap-4 text-center group",
                            formData.fulfillmentType === "Pickup Station"
                                ? "bg-[#F0F5FF]/50 border-brand-blue"
                                : "bg-white border-brand-stroke hover:border-brand-blue/30"
                        )}
                    >
                        <div className={cn(
                            "size-8 xl:size-10 2xl:size-12 rounded-lg xl:rounded-xl flex items-center justify-center transition-all",
                            formData.fulfillmentType === "Pickup Station" ? "bg-brand-blue/20 text-brand-blue" : "bg-brand-bg text-brand-mute"
                        )}>
                            <MapPin className="size-4 xl:size-5 2xl:size-6" />
                        </div>
                        <div className="space-y-0.5">
                            <p className={cn("text-[13px] xl:text-[14px] 2xl:text-[16px] font-bold", formData.fulfillmentType === "Pickup Station" ? "text-brand-blue" : "text-brand-navy")}>Pickup Station</p>
                            <p className="text-[9px] xl:text-[10px] 2xl:text-[11px] font-medium text-brand-mute px-2">Collect from our nearest hub</p>
                        </div>
                    </button>
                </div>

                {/* Quantity Selection */}
                <div className="space-y-1.5 xl:space-y-2 2xl:space-y-3">
                    <label className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[16px] font-bold">Quantity <span className="text-red-500">*</span></label>
                    <div className="relative">
                        <input
                            type="number"
                            value={formData.quantity}
                            onKeyDown={(e) => {
                                // Block e, E, +, -, . 
                                if (["e", "E", "+", "-", "."].includes(e.key)) {
                                    e.preventDefault();
                                }
                            }}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === "") {
                                    updateFormData({ quantity: "" });
                                    return;
                                }
                                const numVal = parseInt(val);
                                if (!isNaN(numVal)) {
                                    updateFormData({ quantity: Math.max(1, numVal) });
                                }
                            }}
                            onBlur={() => {
                                if (formData.quantity === "" || (typeof formData.quantity === "number" && formData.quantity < 1)) {
                                    updateFormData({ quantity: 1 });
                                }
                            }}
                            placeholder="Number of banners"
                            className="w-full h-[44px] xl:h-[48px] 2xl:h-14 bg-brand-bg border border-brand-stroke rounded-[10px] xl:rounded-[12px] 2xl:rounded-[16px] px-3 xl:px-4 2xl:px-6 outline-none focus:bg-white transition-all font-medium text-[13px] xl:text-[14px] 2xl:text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pr-24"
                        />
                        <div className="absolute right-4 xl:right-6 top-1/2 -translate-y-1/2 pointer-events-none border-l border-brand-stroke pl-4">
                            <span className="text-brand-mute text-[10px] xl:text-[11px] 2xl:text-[12px] font-bold uppercase tracking-widest leading-none">Banners</span>
                        </div>
                    </div>
                </div>

                {/* Dynamic Address Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 xl:gap-4 2xl:gap-8">
                    {/* Country */}
                    <div className="md:col-span-2 space-y-1.5 xl:space-y-2 2xl:space-y-3">
                        <label className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[15px] font-bold">Country <span className="text-red-500">*</span></label>
                        <select
                            value={formData.shipping.country}
                            onChange={(e) => updateFormData({ shipping: { ...formData.shipping, country: e.target.value, state: "", city: "" } })}
                            className="w-full h-[44px] xl:h-[48px] 2xl:h-14 bg-brand-bg border border-brand-stroke rounded-[10px] xl:rounded-[12px] 2xl:rounded-[16px] px-3 xl:px-4 2xl:px-6 outline-none focus:bg-white transition-all font-medium appearance-none cursor-pointer text-[13px] xl:text-[14px] 2xl:text-base"
                        >
                            <option value="">Select Country</option>
                            {availableCountries.map(c => <option key={c.iso2} value={c.name}>{c.name}</option>)}
                        </select>
                    </div>

                    {formData.fulfillmentType === "Door-to-door" ? (
                        <>
                            <div className="space-y-1.5 xl:space-y-2 2xl:space-y-3">
                                <label className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[15px] font-bold">State <span className="text-red-500">*</span></label>
                                <select
                                    disabled={!formData.shipping.country || isLoadingLocations}
                                    value={formData.shipping.state}
                                    onChange={(e) => updateFormData({ shipping: { ...formData.shipping, state: e.target.value, city: "" } })}
                                    className="w-full h-[44px] xl:h-[48px] 2xl:h-14 bg-brand-bg border border-brand-stroke rounded-[10px] xl:rounded-[12px] 2xl:rounded-[16px] px-3 xl:px-4 2xl:px-6 outline-none focus:bg-white transition-all font-medium appearance-none cursor-pointer disabled:opacity-50 text-[13px] xl:text-[14px] 2xl:text-base"
                                >
                                    <option value="">{isLoadingLocations && formData.shipping.country ? "Loading..." : "Select State"}</option>
                                    {availableStates.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5 xl:space-y-2 2xl:space-y-3">
                                <label className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[15px] font-bold">City/LGA <span className="text-red-500">*</span></label>
                                <select
                                    disabled={!formData.shipping.state || isLoadingLocations}
                                    value={formData.shipping.city}
                                    onChange={(e) => updateFormData({ shipping: { ...formData.shipping, city: e.target.value } })}
                                    className="w-full h-[44px] xl:h-[48px] 2xl:h-14 bg-brand-bg border border-brand-stroke rounded-[10px] xl:rounded-[12px] 2xl:rounded-[16px] px-3 xl:px-4 2xl:px-6 outline-none focus:bg-white transition-all font-medium appearance-none cursor-pointer disabled:opacity-50 text-[13px] xl:text-[14px] 2xl:text-base"
                                >
                                    <option value="">{isLoadingLocations && formData.shipping.state ? "Loading..." : "Select City"}</option>
                                    {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2 space-y-1.5 xl:space-y-2 2xl:space-y-3 relative">
                                <label className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[15px] font-bold">Street Address <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={formData.shipping.streetAddress}
                                        onChange={(e) => handleAddressSearch(e.target.value)}
                                        placeholder="Enter full street address"
                                        className="w-full h-[44px] xl:h-[48px] 2xl:h-14 bg-brand-bg border border-brand-stroke rounded-[10px] xl:rounded-[12px] 2xl:rounded-[16px] px-3 xl:px-4 2xl:px-6 outline-none focus:bg-white transition-all font-medium text-[13px] xl:text-[14px] 2xl:text-base"
                                        onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 200)}
                                    />
                                    {isSearchingAddress && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <div className="w-3 xl:w-4 h-3 xl:h-4 border-2 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <AnimatePresence>
                                    {showAddressSuggestions && addressResults.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute z-50 w-full mt-1 xl:mt-2 bg-white border border-brand-stroke rounded-[12px] xl:rounded-[16px] 2xl:rounded-[20px] shadow-2xl overflow-hidden max-h-[180px] xl:max-h-[240px] 2xl:max-h-[300px] overflow-y-auto"
                                        >
                                            {addressResults.map((result) => (
                                                <button
                                                    key={result.id}
                                                    onClick={() => selectAddress(result)}
                                                    className="w-full text-left px-4 py-2 xl:px-5 xl:py-3 2xl:px-6 2xl:py-4 hover:bg-brand-bg transition-colors border-b border-brand-stroke last:border-0 flex flex-col gap-0.5"
                                                >
                                                    <span className="text-[12px] xl:text-[13px] 2xl:text-[14px] font-bold text-brand-navy">{result.text}</span>
                                                    <span className="text-[10px] xl:text-[11px] text-brand-mute">{result.place_name}</span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </>
                    ) : (
                        <div className="md:col-span-2 space-y-1.5 xl:space-y-2 2xl:space-y-3 relative">
                            <label className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[15px] font-bold">Pickup Station <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={formData.shipping.pickupStation}
                                    onChange={(e) => handleAddressSearch(e.target.value)}
                                    placeholder="Search stations (DHL, GIG, Jumia)"
                                    className="w-full h-[44px] xl:h-[48px] 2xl:h-14 bg-brand-bg border border-brand-stroke rounded-[10px] xl:rounded-[12px] 2xl:rounded-[16px] px-3 xl:px-4 2xl:px-6 outline-none focus:bg-white transition-all font-medium text-[13px] xl:text-[14px] 2xl:text-base"
                                    onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 200)}
                                />
                                {isSearchingAddress && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <div className="w-3 xl:w-4 h-3 xl:h-4 border-2 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            <AnimatePresence>
                                {showAddressSuggestions && addressResults.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="absolute z-50 w-full mt-1 bg-white border border-brand-stroke rounded-[12px] shadow-2xl overflow-hidden max-h-[180px] overflow-y-auto"
                                    >
                                        {addressResults.map((result) => (
                                            <button
                                                key={result.id}
                                                onClick={() => {
                                                    updateFormData({ shipping: { ...formData.shipping, pickupStation: result.text } });
                                                    setShowAddressSuggestions(false);
                                                }}
                                                className="w-full text-left px-4 py-2 hover:bg-brand-bg transition-colors border-b border-brand-stroke last:border-0 flex flex-col gap-0.5"
                                            >
                                                <span className="text-[12px] font-bold text-brand-navy">{result.text}</span>
                                                <span className="text-[10px] text-brand-mute">{result.place_name}</span>
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    <div className="space-y-1.5 xl:space-y-2 2xl:space-y-3">
                        <label className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[15px] font-bold">Recipient Name <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={formData.shipping.recipientName}
                            onChange={(e) => updateFormData({ shipping: { ...formData.shipping, recipientName: e.target.value } })}
                            placeholder="Full name"
                            className="w-full h-[44px] xl:h-[48px] 2xl:h-14 bg-brand-bg border border-brand-stroke rounded-[10px] xl:rounded-[12px] 2xl:rounded-[16px] px-3 xl:px-4 2xl:px-6 outline-none focus:bg-white transition-all font-medium text-[13px] xl:text-[14px] 2xl:text-base"
                        />
                    </div>
                    <div className="space-y-1.5 xl:space-y-2 2xl:space-y-3">
                        <label className="text-brand-navy text-[13px] xl:text-[14px] 2xl:text-[15px] font-bold">Phone Number <span className="text-red-500">*</span></label>
                        <input
                            type="tel"
                            value={formData.shipping.phoneNumber}
                            onChange={(e) => updateFormData({ shipping: { ...formData.shipping, phoneNumber: e.target.value } })}
                            placeholder="Phone number"
                            className="w-full h-[44px] xl:h-[48px] 2xl:h-14 bg-brand-bg border border-brand-stroke rounded-[10px] xl:rounded-[12px] 2xl:rounded-[16px] px-3 xl:px-4 2xl:px-6 outline-none focus:bg-white transition-all font-medium text-[13px] xl:text-[14px] 2xl:text-base"
                        />
                    </div>
                </div>

                {/* Delivery Cost Estimate Card */}
                <div className="bg-brand-bg border border-brand-stroke rounded-[14px] xl:rounded-[18px] 2xl:rounded-[24px] p-4 xl:p-6 2xl:p-8 space-y-4 xl:space-y-6 2xl:space-y-8">
                    <div className="flex items-center gap-3 2xl:gap-4">
                        <div className="size-7 xl:size-8 2xl:size-10 rounded-lg xl:rounded-xl flex items-center justify-center text-brand-blue">
                            <Calculator className="size-3.5 xl:size-4 2xl:size-5" />
                        </div>
                        <h4 className="text-brand-navy font-bold text-[14px] xl:text-[15px] 2xl:text-[18px]">Delivery Cost Estimate</h4>
                    </div>

                    <div className="space-y-2.5 xl:space-y-3 2xl:space-y-4">
                        {[
                            { label: "Location:", value: formData.fulfillmentType === "Door-to-door" ? `${formData.shipping.city || "Ikeja"}, ${formData.shipping.state || "Lagos"}` : (formData.shipping.pickupStation || "Selected Station") },
                            { label: "Size:", value: formData.size.replace("x", "×") + " cm" },
                            { label: "Usage:", value: formData.environment },
                            { label: "Total Units:", value: `${formData.quantity} items` },
                            { label: "Stand Type:", value: formData.quality },
                            { label: "Fulfillment:", value: formData.fulfillmentType },
                        ].map((row, idx) => (
                            <div key={idx} className="flex justify-between items-center text-[11px] xl:text-[12px] 2xl:text-[14px]">
                                <span className="text-brand-mute font-medium">{row.label}</span>
                                <span className="text-brand-navy font-bold">{row.value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="pt-3 xl:pt-4 2xl:pt-6 border-t border-brand-stroke flex justify-between items-center">
                        <span className="text-brand-navy font-bold text-[13px] xl:text-[14px] 2xl:text-base">Estimated Delivery:</span>
                        <span className="text-brand-blue text-[16px] xl:text-[18px] 2xl:text-[20px] font-black">₦0</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 xl:gap-4 pt-4 xl:pt-6 2xl:pt-12">
                    <button
                        onClick={onPrev}
                        disabled={formData.isSubmitting}
                        className="flex-1 h-[48px] xl:h-[52px] 2xl:h-16 border-2 border-brand-stroke rounded-full text-brand-navy font-bold hover:bg-brand-bg transition-all text-[14px] xl:text-[15px] 2xl:text-[18px] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        Previous
                    </button>
                    <button
                        onClick={onSubmit}
                        disabled={formData.isSubmitting}
                        className="flex-[1.5] h-[48px] xl:h-[52px] 2xl:h-16 rounded-full text-white font-bold transition-all hover:scale-[1.01] bg-linear-to-r from-[#0035C1] to-[#0575FF] shadow-lg shadow-brand-blue/20 text-[14px] xl:text-[15px] 2xl:text-[18px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {formData.isSubmitting ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Submitting...
                            </>
                        ) : "Submit"}
                    </button>
                </div>
            </div>
        </motion.div>
    );
};
