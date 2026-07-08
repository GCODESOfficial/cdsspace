"use client";

import { SectionHeader } from "@/components/shared/SectionHeader";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";

const services = [
    "Merch",
    "Banners",
    "Brand Identity",
    "Product Design",
    "Web Development"
];

const phrases = [
    "Hello CDS...",
    "We need to stand out.",
    "Our UI is broken.",
    "Can we scale this?",
    "We need a rebrand.",
    "Make us look premium.",
];

const TypingText = () => {
    const [currentPhrase, setCurrentPhrase] = useState("");
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [typingSpeed, setTypingSpeed] = useState(100);

    useEffect(() => {
        const handleTyping = () => {
            const fullText = phrases[phraseIndex];

            if (isDeleting) {
                setCurrentPhrase(fullText.substring(0, currentPhrase.length - 1));
                setTypingSpeed(50);
            } else {
                setCurrentPhrase(fullText.substring(0, currentPhrase.length + 1));
                setTypingSpeed(100);
            }

            if (!isDeleting && currentPhrase === fullText) {
                setTimeout(() => setIsDeleting(true), 2000); // Pause at end
            } else if (isDeleting && currentPhrase === "") {
                setIsDeleting(false);
                setPhraseIndex((prev) => (prev + 1) % phrases.length);
            }
        };

        const timer = setTimeout(handleTyping, typingSpeed);
        return () => clearTimeout(timer);
    }, [currentPhrase, isDeleting, phraseIndex, typingSpeed]);

    return (
        <span className="text-brand-body text-sm lg:text-base font-medium tracking-tight flex items-center">
            {currentPhrase}
            <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="w-0.5 h-4 bg-brand-blue ml-0.5"
            />
        </span>
    );
};

export const HowItWorksBig = () => {
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isUrgentActive, setIsUrgentActive] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <section className="py-16 md:py-24 lg:py-32 bg-brand-bg overflow-hidden" id="how-it-works">
            <div className="section-container">
                <SectionHeader
                    title="How we Work"
                    description="Simple steps, clear delivery."
                    className="mb-12 md:mb-16 lg:mb-20"
                />

                {/* The Grid: Responsive columns and gap */}
                <div className="flex flex-col lg:flex-row gap-4 md:gap-6 justify-center max-w-[1200px] mx-auto px-12 2xl:px-0">

                    {/* Step 1: Vision */}
                    <div className="relative group w-full 2xl:w-[318.67px] h-[384px] rounded-[24px] overflow-hidden border border-brand-stroke animate-reveal opacity-0 flex flex-col justify-end pt-[16px] px-[8px] pb-[8px] gap-[10px]" style={{ animationDelay: '0.1s' }}>
                        <Image
                            src="/home/Frame 2147228357.svg"
                            alt="Vision"
                            fill
                            sizes="(max-width: 1024px) 100vw, 320px"
                            className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/30 via-transparent to-transparent pointer-events-none" />

                        <div className="relative z-10 bg-white p-4 md:p-6 rounded-[16px] shadow-xl border border-brand-stroke w-full">
                            <h3 className="text-lg lg:text-[20px] font-semibold text-brand-navy mb-2 lg:mb-3 tracking-tight">Share your vision</h3>
                            <div className="flex items-center gap-2 md:gap-3 p-1.5 md:p-2 bg-white border border-brand-stroke rounded-full h-[40px] md:h-[48px]">
                                <div className="w-6 lg:w-8 h-6 lg:h-8 rounded-full overflow-hidden relative border border-brand-stroke shrink-0">
                                    <Image src="/home/9439678.svg" alt="User" fill sizes="32px" className="object-cover" />
                                </div>
                                <span className="text-brand-body text-sm lg:text-base font-medium tracking-tight flex items-center shrink-0">
                                    <TypingText />

                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Step 2: Subscription Selection */}
                    <div className="bg-white w-full 2xl:w-[318.67px] h-[384px] rounded-[24px] border border-brand-stroke pt-[16px] px-[24px] pb-[24px] flex flex-col animate-reveal opacity-0 relative group" style={{ animationDelay: '0.2s' }}>
                        {/* Top Container for List and Toggle */}
                        <div className="flex flex-col gap-[8px] relative mb-auto">
                            {/* Service List Box */}
                            <div
                                ref={containerRef}
                                className="bg-brand-bg rounded-[16px] py-[16px] flex flex-col gap-[10px] relative overflow-hidden"
                            >
                                {services.map((service, idx) => (
                                    <div key={service} className="flex items-center justify-between px-[16px]">
                                        <span className="text-[#4B5563] text-[14px] font-medium tracking-tight leading-[1.24]">{service}</span>
                                        <motion.div
                                            className="w-[24px] h-[24px] rounded-full border-2 border-brand-stroke-ii overflow-hidden flex items-center justify-center"
                                            animate={{
                                                backgroundColor: activeIndex === idx ? "#1C4ED1" : "transparent",
                                                borderColor: activeIndex === idx ? "#1C4ED1" : "#C8D1E0",
                                            }}
                                        >
                                            {activeIndex === idx && (
                                                <div className="w-[8px] h-[8px] bg-white rounded-full" />
                                            )}
                                        </motion.div>
                                    </div>
                                ))}
                            </div>

                            {/* Urgent Delivery Box */}
                            <div className="bg-brand-bg rounded-[16px] py-[11px] px-[10px] flex items-center gap-[8px] relative">
                                <motion.div
                                    className="w-[45.18px] h-[26px] rounded-full relative p-[2px] border border-white"
                                    animate={{
                                        backgroundColor: isUrgentActive ? "#1C4ED1" : "#E3E8F4"
                                    }}
                                >
                                    <motion.div
                                        className="w-[20px] h-[20px] bg-white rounded-full shadow-md"
                                        animate={{
                                            x: isUrgentActive ? 18 : 0
                                        }}
                                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    />
                                </motion.div>
                                <span className={cn(
                                    "text-[14px] font-medium tracking-tight whitespace-nowrap transition-colors",
                                    isUrgentActive ? "text-brand-navy" : "text-[#9CA3AF]"
                                )}>Urgent delivery (2 days)</span>
                            </div>

                            {/* AUTOMATED MAGIC CURSOR: Covering the whole stack */}
                            <motion.div
                                className="absolute z-50 flex items-center pointer-events-none"
                                style={{ right: "50%" }}
                                animate={{
                                    top: ["6%", "22%", "38%", "54%", "70%", "86%", "6%"],
                                }}
                                onUpdate={(latest) => {
                                    const top = parseFloat(latest.top as string);
                                    if (top < 14) setActiveIndex(0);
                                    else if (top < 30) setActiveIndex(1);
                                    else if (top < 46) setActiveIndex(2);
                                    else if (top < 62) setActiveIndex(3);
                                    else if (top < 78) {
                                        setActiveIndex(4);
                                        setIsUrgentActive(false);
                                    }
                                    else if (top >= 78 && top < 95) {
                                        setActiveIndex(-1);
                                        setIsUrgentActive(true);
                                    }
                                    else {
                                        setActiveIndex(-1);
                                        setIsUrgentActive(false);
                                    }
                                }}
                                transition={{
                                    duration: 10,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                }}
                            >
                                <div className="relative">
                                    <Image src="/home/cursor-magic-selection-04.svg" alt="Magic" width={24} height={24} className="drop-shadow-xl" />

                                    <div className="absolute left-[20px] top-3 bg-brand-blue text-white px-[12px] py-[4px] rounded-full flex items-center gap-[6px] whitespace-nowrap shadow-xl">
                                        <div className="w-[24px] h-[24px] rounded-full bg-white overflow-hidden relative shrink-0">
                                            <Image src="/home/9439678.svg" alt="Avatar" fill sizes="24px" className="object-cover" />
                                        </div>
                                        <span className="text-[12px] font-medium tracking-tight">Styles</span>
                                    </div>
                                </div>
                            </motion.div>
                        </div>

                        <div className="pt-[8px]">
                            <h3 className="text-[20px] font-medium text-brand-navy mb-[4px] tracking-tight leading-[1.24]">Select a subscription</h3>
                            <p className="text-[#4B5563] text-[16px] tracking-tight leading-normal">Choose a plan that fits.</p>
                        </div>
                    </div>

                    {/* Step 3: We Deliver */}
                    <div className="bg-white w-full 2xl:w-[318.67px] h-[384px] rounded-[24px] border border-brand-stroke flex flex-col overflow-hidden animate-reveal opacity-0" style={{ animationDelay: '0.3s' }}>
                        <div className="relative h-[289px] bg-brand-bg flex items-center justify-center overflow-hidden">
                            <Image
                                src="/deliver.gif"
                                alt="We bring your brand to life"
                                fill
                                sizes="(max-width: 1024px) 100vw, 320px"
                                className="object-contain transition-transform duration-700 group-hover:scale-105"
                                unoptimized
                            />
                        </div>

                        <div className="px-[24px] pt-[19px] pb-[24px] bg-white border-t border-brand-stroke grow flex flex-col justify-center">
                            <h3 className="text-[20px] font-bold text-brand-navy mb-[8px] tracking-tight leading-[1.24]">We Deliver</h3>
                            <p className="text-[#4B5563] text-[16px] tracking-tight leading-normal">We bring it to life.</p>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
};
