"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Navigation, ExternalLink, X } from "lucide-react";

/**
 * Modular data-driven Footer Section
 * Parent Node ID: 5909:29861
 */
interface FooterLink {
    label: string;
    href?: string;
    isStatic?: boolean;
    badge?: string;
    hasMap?: boolean;
}

// CDS Space HQ - used for the live map widget
const CDS_MAP = {
    query: "CDS Space, Uyo, Nigeria",
    shareUrl: "https://share.google/NIu5EOfuVtZMMvXvi",
    directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=CDS+Space%2C+Uyo%2C+Nigeria",
    embedUrl: "https://www.google.com/maps?q=CDS+Space%2C+Uyo%2C+Nigeria&output=embed",
};

interface FooterSection {
    title: string;
    links: FooterLink[];
}

export const Footer = () => {
    const year = new Date().getFullYear();
    const [mapOpen, setMapOpen] = useState(false);

    const footerNavigation: FooterSection[] = [
        {
            title: "Menu",
            links: [
                { label: "Home", href: "/" },
                { label: "About", href: "/about" },
                { label: "Work", href: "/work" },
                { label: "Contact", href: "/consultation" },
            ]
        },
        {
            title: "CDS Studio",
            links: [
                { label: "Blog", href: "/blog" },
                { label: "Brand Brief", href: "/consultation" },
                { label: "Partnership", href: "/partnership" },
                { label: "Rollup Banners", href: "/banners" },
                { label: "Merch", href: "/merch" },
                { label: "Links", href: "/Links" },
            ]
        },
        {
            title: "Community",
            links: [
                { label: "Career", href: "/Career" },
                { label: "X", href: "https://x.com/cdsspace_" },
                { label: "TikTok", href: "https://vm.tiktok.com/ZS9dpUwVB8row-InHYP/" },
                { label: "Facebook", href: "https://web.facebook.com/cdsspace" },
                { label: "Instagram", href: "https://www.instagram.com/cdsspace" },
                { label: "LinkedIn", href: "https://www.linkedin.com/company/cdsspace/" },
                { label: "Youtube", href: "https://www.youtube.com/@cdsspacelive" },
                { label: "WhatsApp", href: "https://wa.me/message/V7K4SBQW7METG1" },
            ]
        },
        {
            title: "Offices",
            links: [
                { label: "HQ - Uyo, Nigeria (NG)", isStatic: true, hasMap: true },
                { label: "Rwanda - RW", isStatic: true, badge: "Coming soon" },
            ]
        }
    ];

    return (
        <footer className="w-full bg-brand-bg relative pt-12 md:pt-0 pb-0 overflow-hidden px-4 sm:px-6" id="footer">
            <div className="w-full flex flex-col">

                {/* 1. "Let's Build Your Brand" Upper Section - Node 5909:29862 */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="relative w-full overflow-hidden rounded-t-[24px] bg-[#040B37] min-h-[360px] sm:min-h-[420px] md:min-h-[640px] flex flex-col items-center justify-center text-center py-12 px-5 sm:px-6 md:p-8 lg:p-12 border-b border-white/5"
                >
                    {/* Background Glow */}
                    <div
                        className="absolute top-[-281.5px] left-1/2 -translate-x-1/2 w-[367px] h-[563px] mix-blend-plus-lighter opacity-60 pointer-events-none select-none"
                        style={{
                            background: "radial-gradient(50% 50% at 50% 50%, #0575FF 0%, rgba(5, 117, 255, 0) 100%)",
                            filter: "blur(60px)"
                        }}
                    />

                    {/* CDS Watermark Logo */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[240px] pointer-events-none opacity-80 select-none overflow-hidden">
                        <Image
                            src="/home/CDS Logo.svg"
                            alt=""
                            fill
                            className="object-bottom object-contain"
                        />
                    </div>

                    <div className="relative z-20 flex flex-col items-center gap-6 sm:gap-8 md:gap-10">
                        <h2 className="text-[2rem] sm:text-4xl md:text-5xl lg:text-[64px] font-semibold text-white leading-[1.08] tracking-[-1px] max-w-3xl">
                            Let’s Build Your Brand
                        </h2>

                        <div className="relative group">
                            {/* Animated Cursor */}
                            <motion.div
                                className="absolute z-30 pointer-events-none select-none hidden md:block"
                                animate={{
                                    x: [100, 140, 100, 60, 100],
                                    y: [-20, 40, 100, 40, -20],
                                    rotate: [0, 5, 0, -5, 0]
                                }}
                                transition={{
                                    duration: 8,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            >
                                <div className="relative">
                                    <div className="absolute left-[16px] top-[15px] bg-[#040B37] border-2 border-[#0575FF] px-4 py-2 rounded-full whitespace-nowrap shadow-2xl">
                                        <span className="text-white text-[14px] font-medium tracking-[-0.14px]">Start here</span>
                                    </div>
                                    <Image
                                        src="/home/cursor-magic-selection-04.svg"
                                        alt=""
                                        width={24}
                                        height={24}
                                        className="drop-shadow-xl"
                                    />
                                </div>
                            </motion.div>

                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Link
                                    href="/consultation"
                                    className="group relative p-px rounded-full border border-[#648efc]/40 flex items-center justify-center transition-all duration-300 hover:border-[#648efc]"
                                >
                                    <div
                                        className="px-7 py-4 sm:px-10 sm:py-5 md:px-[40px] md:py-[20px] rounded-full text-brand-white text-base sm:text-lg md:text-[20px] font-medium tracking-[-0.2px] transition-all duration-300 shadow-[0_0_40px_rgba(5,117,255,0.3)]"
                                        style={{
                                            background: "linear-gradient(153.896deg, #0035C1 8.8345%, #0575FF 86.298%)"
                                        }}
                                    >
                                        Book a Consultation
                                    </div>
                                </Link>
                            </motion.div>
                        </div>
                    </div>
                </motion.div>

                {/* 2. Main Footer Down Section */}
                <div className="relative w-full bg-[#040B37] rounded-b-[24px] overflow-hidden pt-10 sm:pt-12 md:pt-20 lg:pt-24 px-4 sm:px-6 md:px-12 lg:px-24 xl:px-32 pb-12 min-h-[457px]">

                    {/* Background SVG Decorations */}
                    <div className="absolute bottom-0 left-0 w-[400px] md:w-[659px] h-[320px] md:h-[530px] pointer-events-none opacity-20 md:opacity-30 select-none mix-blend-color-dodge">
                        <Image
                            src="/home/assets/Objects2.svg"
                            alt=""
                            width={659}
                            height={530}
                            className="object-contain object-bottom h-full w-full ml-[-60px]"
                        />
                    </div>
                    <div className="absolute bottom-0 right-[-100px] w-[400px] md:w-[661px] h-[320px] md:h-[531px] pointer-events-none opacity-20 md:opacity-30 select-none mix-blend-color-dodge">
                        <Image
                            src="/home/assets/Objects.svg"
                            alt=""
                            width={661}
                            height={531}
                            className="object-contain object-bottom h-full w-full opacity-50"
                        />
                    </div>

                    <div className="relative z-10 flex flex-col h-full">
                        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1px_3fr] gap-10 sm:gap-12 mb-14 md:mb-24 grow">
                            {/* Company Branding */}
                            <div className="flex flex-col gap-6 w-full">
                                <Link href="/" className="inline-block w-fit">
                                    <Image
                                        src="/navbar/CDS Logo.svg"
                                        alt="CDS Logo"
                                        width={120}
                                        height={54}
                                        className="brightness-0 invert"
                                    />
                                </Link>
                                <p className="text-brand-mute text-base md:text-[16px] font-medium leading-[1.5] tracking-[-0.16px]">
                                    CDS Space helps brands and product teams design, build, and scale digital experiences with clarity and speed.
                                </p>
                            </div>

                            {/* Vertical Divider */}
                            <div className="hidden lg:block w-px h-[360px] bg-white opacity-10 self-center" />

                            {/* Links columns */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-4 lg:gap-x-8 xl:gap-x-12 gap-y-8 sm:gap-y-10">
                                {footerNavigation.map((section) => (
                                    <div key={section.title} className="flex flex-col gap-4 col-span-1">
                                        <h3 className="text-white text-lg font-semibold tracking-[-0.18px] mb-2 py-[10.5px]">{section.title}</h3>
                                        <ul className={`flex flex-col ${section.title === 'Offices' ? 'gap-4' : 'gap-1'}`}>
                                            {section.links.map((link, idx) => (
                                                <li key={idx} className="min-w-0">
                                                    {link.isStatic ? (
                                                        link.hasMap ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setMapOpen(true)}
                                                                className="group py-[4px] text-left w-full"
                                                            >
                                                                <span className="text-brand-mute group-hover:text-white transition-colors text-base font-medium tracking-[-0.16px] underline-offset-4 group-hover:underline break-words">
                                                                    {link.label}
                                                                </span>
                                                            </button>
                                                        ) : (
                                                            <div className="flex flex-wrap items-center gap-2 py-[4px]">
                                                                <p className="text-brand-mute text-base font-medium tracking-[-0.16px] break-words">
                                                                    {link.label}
                                                                </p>
                                                                {link.badge && (
                                                                    <div className="bg-[#0F1851] border border-[#1D286C] rounded-full px-1 sm:px-3 py-0 sm:py-1 shadow-lg">
                                                                        <span className="text-[#7399FA] text-[8px] sm:text-[12px] font-medium whitespace-nowrap tracking-[-0.12px]">
                                                                            {link.badge}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    ) : (
                                                        <Link
                                                            href={link.href || "#"}
                                                            target={link.href?.startsWith('http') ? "_blank" : undefined}
                                                            rel={link.href?.startsWith('http') ? "noopener noreferrer" : undefined}
                                                            className="inline-block py-[10.5px] text-brand-mute hover:text-white transition-colors text-base font-medium tracking-[-0.16px] break-words"
                                                        >
                                                            {link.label}
                                                        </Link>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Bottom Copyright Section */}
                        <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-4 mt-auto">
                            <p className="text-[#8E8E8E] text-[14px] font-medium tracking-[-0.14px] text-center md:text-left">
                                &copy; {year} CDS Space | Branding Agency. All rights reserved
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-8 md:gap-12">
                                <Link href="/privacy" className="text-brand-mute hover:text-white text-[14px] font-medium tracking-[-0.14px] transition-colors">Privacy Policy</Link>
                                <Link href="/terms" className="text-brand-mute hover:text-white text-[14px] font-medium tracking-[-0.14px] transition-colors">Terms of Service</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Live HQ map widget */}
            <Dialog open={mapOpen} onOpenChange={setMapOpen}>
                <DialogContent className="bg-white p-0 max-w-3xl w-[95vw] rounded-2xl border-0 shadow-2xl overflow-hidden">
                    <DialogTitle className="sr-only">CDS Space HQ - Uyo, Nigeria</DialogTitle>
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <Image src="/navbar/CDS Logo.svg" alt="CDS Space" width={44} height={44} />
                            <div>
                                <div className="text-base font-semibold text-gray-900">CDS Space HQ</div>
                                <div className="text-xs text-gray-500">Uyo, Akwa Ibom - Nigeria</div>
                            </div>
                        </div>
                        <button onClick={() => setMapOpen(false)} className="w-9 h-9 rounded-lg hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-gray-900 transition">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="relative w-full" style={{ aspectRatio: "16 / 10" }}>
                        <iframe
                            src={CDS_MAP.embedUrl}
                            className="absolute inset-0 w-full h-full border-0"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            allowFullScreen
                            title="CDS Space HQ"
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 px-6 py-4 border-t border-gray-100">
                        <a
                            href={CDS_MAP.directionsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 text-white font-medium shadow-lg shadow-blue-600/30 hover:from-blue-600 hover:to-blue-800 transition"
                        >
                            <Navigation className="w-4 h-4" /> Get Directions
                        </a>
                        <a
                            href={CDS_MAP.shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition"
                        >
                            <ExternalLink className="w-4 h-4" /> Open in Google Maps
                        </a>
                    </div>
                </DialogContent>
            </Dialog>
        </footer>
    );
};
