"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AsYouType, CountryCode, getCountries, getCountryCallingCode } from "libphonenumber-js";
import * as Flags from "country-flag-icons/react/3x2";
import { ChevronDown, Search, Check } from "lucide-react";

interface PhoneInputProps {
    value?: string;
    onChange?: (value: string) => void;
    onBlur?: () => void;
    name?: string;
    error?: boolean;
    disabled?: boolean;
    className?: string;
}

// Exclude micro-territories that strictly share calling codes with their parent nations 
// to prevent the user from seeing "duplicate" +44 codes (e.g. Guernsey, Jersey)
const DUPLICATE_TERRITORIES: CountryCode[] = ['GG', 'IM', 'JE', 'SJ', 'VA', 'CC', 'CX'];
const COUNTRIES = getCountries().filter(c => !DUPLICATE_TERRITORIES.includes(c));
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

const getCountryName = (code: CountryCode) => {
    try {
        return regionNames.of(code) || code;
    } catch {
        return code;
    }
};

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
    ({ value = "", onChange, onBlur, name, error, disabled, className }, ref) => {
        const [isOpen, setIsOpen] = useState(false);
        const [search, setSearch] = useState("");
        const [country, setCountry] = useState<CountryCode>("NG");
        const dropdownRef = useRef<HTMLDivElement>(null);

        // Input ref forwarding combined with local ref
        const inputRef = useRef<HTMLInputElement>(null);

        // Click outside listener
        useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                }
            };
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }, []);

        // Detect Country by IP
        useEffect(() => {
            if (!value) {
                fetch("https://ipapi.co/json/")
                    .then((res) => res.json())
                    .then((data) => {
                        if (data?.country_code && COUNTRIES.includes(data.country_code as CountryCode)) {
                            setCountry(data.country_code as CountryCode);
                        }
                    })
                    .catch(() => { });
            }
        }, [value]);

        // Parse existing value strictly to extract country automatically (useful for pastes)
        useEffect(() => {
            if (value && value.trim() !== "") {
                try {
                    const asYouType = new AsYouType();
                    // Just parsing the string dynamically extracts country natively if a code is present
                    asYouType.input(value);
                    const pCountry = asYouType.getCountry();

                    if (pCountry && pCountry !== country) {
                        setCountry(pCountry);
                    }
                } catch {
                    // Fail silently, just keep default country
                }
            }
        }, [value]);

        const FlagComponent = Flags[country] || (() => <div className="w-full h-full bg-gray-200" />);

        const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            let rawValue = e.target.value;

            let processValue = rawValue;
            if (!rawValue.startsWith("+")) {
                const currentCode = `+${getCountryCallingCode(country)} `;
                // Completely empty if they delete everything
                if (rawValue.trim() === "") {
                    processValue = "";
                } else {
                    processValue = currentCode + rawValue;
                }
            }

            // Determine what country the user might be moving toward on the fly
            const asYouType = new AsYouType(country);
            const formatted = asYouType.input(processValue);

            // If the user fully typed or pasted a different country code, update flag dynamically
            const parsedCountry = asYouType.getCountry();
            if (parsedCountry && parsedCountry !== country) {
                setCountry(parsedCountry);
            }

            if (onChange) {
                // Pass formatted string upward so user sees formatting real-time
                onChange(formatted);
            }
        };

        // Deriving the visual display for the raw input field to not redundantly show the +code
        let displayValue = value || "";
        const activePrefix = `+${getCountryCallingCode(country)}`;
        if (displayValue.startsWith(activePrefix)) {
            displayValue = displayValue.slice(activePrefix.length).trimStart();
        }

        const handleCountrySelect = (c: CountryCode) => {
            setCountry(c);
            setIsOpen(false);
            setSearch("");

            const code = getCountryCallingCode(c);
            if (onChange) {
                // Pre-fill the input with the selected country's calling code, formatted
                onChange(`+${code} `);
            }
            inputRef.current?.focus();
        };

        const filteredCountries = COUNTRIES.filter((c) => {
            const name = getCountryName(c).toLowerCase();
            const code = getCountryCallingCode(c);
            const searchLower = search.toLowerCase();
            return name.includes(searchLower) || code.includes(searchLower);
        });

        return (
            <div className={`relative ${className}`} ref={dropdownRef}>
                <div className={`bg-brand-bg border rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] p-1.5 lg:p-2 flex gap-2 lg:gap-3 2xl:gap-4 items-center transition-colors ${error ? 'border-red-500' : 'border-brand-stroke focus-within:border-brand-blue'}`}>

                    {/* Selector Trigger */}
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setIsOpen(!isOpen)}
                        className="bg-[#E9EBF0] h-8 lg:h-10 2xl:h-12 px-2 lg:px-2.5 rounded-md lg:rounded-lg 2xl:rounded-[10px] flex items-center gap-1.5 lg:gap-2 2xl:gap-3 shrink-0 hover:bg-[#dfe1e6] transition-colors disabled:opacity-50"
                    >
                        <div className="size-5 lg:size-6 2xl:size-[30px] bg-white rounded-full flex items-center justify-center shadow-sm relative overflow-hidden shrink-0">
                            {/* Object cover and scale makes the 3x2 flag fill the circle perfectly */}
                            <div className="w-full h-full scale-[1.3] flex items-center justify-center">
                                <FlagComponent className="w-full h-full object-cover" />
                            </div>
                        </div>
                        <span className="text-brand-body text-[12px] lg:text-[13px] 2xl:text-[15px] font-medium tracking-[-0.01em]">
                            +{getCountryCallingCode(country)}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-brand-mute ml-0.5" />
                    </button>

                    {/* Input Field */}
                    <input
                        ref={(e) => {
                            if (typeof ref === 'function') ref(e);
                            else if (ref) ref.current = e;
                            inputRef.current = e;
                        }}
                        type="tel"
                        name={name}
                        value={displayValue}
                        onChange={handleInputChange}
                        onBlur={onBlur}
                        placeholder="000 000 0000"
                        disabled={disabled}
                        className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute disabled:opacity-50"
                    />
                </div>

                {/* Dropdown Menu */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-[calc(100%+8px)] left-0 w-[300px] 2xl:w-[360px] max-h-[320px] 2xl:max-h-[400px] bg-white border border-brand-stroke rounded-[12px] 2xl:rounded-[16px] shadow-[0_12px_24px_rgba(0,0,0,0.08)] z-50 overflow-hidden flex flex-col"
                        >
                            {/* Search Sticky Header */}
                            <div className="p-3 2xl:p-4 border-b border-brand-stroke/50 bg-gray-50/50">
                                <div className="bg-white border border-brand-stroke rounded-lg 2xl:rounded-xl px-3 py-2 2xl:py-2.5 flex items-center gap-2">
                                    <Search className="w-4 h-4 2xl:w-5 2xl:h-5 text-brand-mute" />
                                    <input
                                        type="text"
                                        placeholder="Search country or code..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="w-full bg-transparent outline-none text-[13px] 2xl:text-[14px] font-medium text-brand-navy placeholder:text-brand-mute"
                                    />
                                </div>
                            </div>

                            {/* Options List */}
                            <div className="flex-1 overflow-y-auto premium-scrollbar p-2">
                                {filteredCountries.length === 0 ? (
                                    <div className="text-center py-6 text-brand-mute text-[13px] 2xl:text-[14px]">
                                        No countries found
                                    </div>
                                ) : (
                                    filteredCountries.map((c) => {
                                        const CFlag = Flags[c] || (() => null);
                                        const isSelected = c === country;
                                        return (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => handleCountrySelect(c)}
                                                className={`w-full flex items-center justify-between px-3 py-2.5 2xl:py-3 rounded-lg 2xl:rounded-xl transition-colors ${isSelected ? 'bg-brand-blue/5' : 'hover:bg-gray-50'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="size-5 2xl:size-6 rounded-sm overflow-hidden border border-brand-stroke/20 shrink-0">
                                                        <CFlag className="w-full h-full object-cover" />
                                                    </div>
                                                    <span className="text-brand-navy text-[13px] 2xl:text-[14px] font-medium text-left truncate max-w-[160px] 2xl:max-w-[200px]">
                                                        {getCountryName(c)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-brand-mute text-[12px] 2xl:text-[13px] font-medium">
                                                        +{getCountryCallingCode(c)}
                                                    </span>
                                                    {isSelected && <Check className="w-4 h-4 text-brand-blue" />}
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }
);

PhoneInput.displayName = "PhoneInput";
