"use client";

import React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const exploreItems = [
    {
        title: "Subscription",
        description: "Choose a design plan.",
        accountHref: "/subscription",
    },
    {
        title: "Brand Brief",
        description: "Define your brand's identity.",
        href: "#",
    },
    {
        title: "Careers",
        description: "Shape brands the world remembers.",
        href: "/Career",
    },
];

const productCards = [
    {
        title: "Banners",
        description: "Roll-up banners for your brand.",
        image: "/home/source/07fbbce755ed61ba1adec6b971cbda1650a2fb94.png",
        accountHref: "/dashboard/banners",
    },
    {
        title: "Merch",
        description: "View & request your merch",
        image: "/home/source/54b250b0180289389a7faef542be363a9bb13baa.png",
        accountHref: "/dashboard/merch",
    },
    {
        title: "Partnership",
        description: "Refer clients and earn",
        image: "/home/source/0b29fab281d7cfe7e98502c49ddc2794b06f2c3c.png",
        accountHref: "/partnership",
    },
];

type StudioDropdownProps = {
    isLoggedIn?: boolean;
};

const getStudioHref = (item: { href?: string; accountHref?: string }, isLoggedIn?: boolean) => {
    if (!item.accountHref) return item.href ?? "#";
    if (isLoggedIn) return item.accountHref;
    return `/signup?next=${encodeURIComponent(item.accountHref)}`;
};

export const StudioDropdown = ({ isLoggedIn = false }: StudioDropdownProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full left-4 right-4 md:left-6 md:right-6 mt-[-16px] z-[-1]"
        >
            <div
                className="bg-white/95 backdrop-blur-md border border-white/80 rounded-b-[18px] md:rounded-b-[24px] shadow-[0_18px_48px_rgba(4,11,55,0.12)] flex gap-4 2xl:gap-8 pb-8 pt-[52px] px-3 md:px-5 2xl:px-6 border-t-0"
                data-node-id="5379:871"
            >
                {/* Left Sidebar: Explore CDS */}
                <div className="w-[240px] 2xl:w-[280px] shrink-0">
                    <div className="px-4 mb-2">
                        <span className="text-sm 2xl:text-base font-medium text-[#4b5563] tracking-[-0.16px]">
                            Explore CDS
                        </span>
                    </div>
                    <div className="flex flex-col">
                        {exploreItems.map((item) => (
                            <Link
                                key={item.title}
                                href={getStudioHref(item, isLoggedIn)}
                                className="group flex flex-col gap-1.5 p-4 rounded-xl hover:bg-[#f4f6fb] transition-colors"
                            >
                                <span className="text-base 2xl:text-[18px] font-medium text-[#040b37] tracking-[-0.72px] group-hover:text-brand-blue transition-colors">
                                    {item.title}
                                </span>
                                <span className="text-[13px] 2xl:text-14px text-[#4b5563] tracking-[-0.14px]">
                                    {item.description}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Right Section: Product Cards Grid */}
                <div className="flex-1 grid grid-cols-3 gap-4">
                    {productCards.map((card) => (
                        <Link
                            key={card.title}
                            href={getStudioHref(card, isLoggedIn)}
                            className="flex flex-col gap-4 p-2.5 bg-white border border-[#e3e8f4] rounded-2xl hover:border-brand-blue/30 hover:shadow-lg transition-all"
                        >
                            {/* Image Container */}
                            <div className="bg-[#e3e8f4] aspect-214/184 rounded-[10px] overflow-hidden relative group">
                                <img
                                    src={card.image}
                                    alt={card.title}
                                    className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                                />
                            </div>

                            {/* Content */}
                            <div className="flex flex-col gap-1.5 px-1.5 pb-2">
                                <span className="text-base 2xl:text-[18px] font-medium text-[#040b37] tracking-[-0.72px]">
                                    {card.title}
                                </span>
                                <span className="text-[13px] 2xl:text-14px text-[#4b5563] tracking-[-0.14px]">
                                    {card.description}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </motion.div>
    );
};

export const MobileStudioAccordion = ({ isLoggedIn = false, onClose }: StudioDropdownProps & { onClose: () => void }) => {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <div className="w-full border-t border-brand-stroke/10 pt-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full text-2xl font-semibold text-[#4b5563] transition-colors hover:text-brand-blue group"
            >
                <span className={cn(isOpen && "text-brand-blue")}>CDS studio</span>
                <ChevronDown
                    size={28}
                    className={cn(
                        "transition-transform duration-300 opacity-60 group-hover:opacity-100",
                        isOpen && "rotate-180 text-brand-blue opacity-100"
                    )}
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col gap-6 py-6 pl-2">
                            {/* Mobile Explore Section - Small text links */}
                            <div className="space-y-4 border-l-2 border-brand-blue/10 pl-4">
                                {exploreItems.map((item) => (
                                    <Link
                                        key={item.title}
                                        href={getStudioHref(item, isLoggedIn)}
                                        onClick={onClose}
                                        className="flex flex-col gap-1"
                                    >
                                        <span className="text-lg font-medium text-[#040b37]">{item.title}</span>
                                        <span className="text-sm text-[#4b5563]">{item.description}</span>
                                    </Link>
                                ))}
                            </div>

                            {/* Mobile Product Thumbnails - Pro Designer Touch */}
                            <div className="space-y-4">
                                {productCards.map((card) => (
                                    <Link
                                        key={card.title}
                                        href={getStudioHref(card, isLoggedIn)}
                                        onClick={onClose}
                                        className="flex items-center gap-4 group"
                                    >
                                        <div className="w-14 h-14 bg-[#f4f6fb] rounded-xl flex items-center justify-center overflow-hidden shrink-0 border border-brand-stroke/10">
                                            <img src={card.image} alt="" className="w-10 h-10 object-contain p-1" />
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-semibold text-[#040b37] group-hover:text-brand-blue transition-colors">{card.title}</span>
                                            <span className="text-xs text-[#4b5563] line-clamp-1">{card.description}</span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
