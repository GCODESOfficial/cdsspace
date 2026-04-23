"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { StudioDropdown, MobileStudioAccordion } from "./StudioDropdown";
import { Menu, X, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
    { name: "Home", href: "/" },
    { name: "About", href: "/about" },
    { name: "Work", href: "/work" },
];

export const Navbar = () => {
    const pathname = usePathname();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // Check auth status
    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            setIsLoggedIn(!!user);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setIsLoggedIn(!!session?.user);
        });
        return () => subscription.unsubscribe();
    }, []);

    const accountHref = isLoggedIn ? "/dashboard" : "/login";

    // Prevent scrolling when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isMobileMenuOpen]);

    return (
        <header className="fixed top-3 sm:top-4 md:top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
            <div className="w-full max-w-[920px] xl:max-w-[1080px] 2xl:max-w-[1140px] px-3 sm:px-4 md:px-6 pointer-events-auto relative">
                <nav
                    className={cn(
                        "w-full h-[58px] sm:h-[62px] md:h-[68px] 2xl:h-[74px] bg-white/95 backdrop-blur-md flex items-center justify-between px-3 sm:px-3.5 md:px-5 2xl:px-6 py-[10px] rounded-[18px] md:rounded-[24px] shadow-[0_18px_48px_rgba(4,11,55,0.12)] border border-white/80 relative z-50 transition-all duration-300",
                        isMobileMenuOpen && "rounded-b-none border-b-0 shadow-none"
                    )}
                    data-node-id="5360:811"
                >
                    {/* CDS Logo - Scaled for Mobile/Desktop */}
                    <Link href="/" className="shrink-0 ml-1.5 md:ml-1 2xl:ml-2" onClick={() => setIsMobileMenuOpen(false)}>
                        <img
                            src="/navbar/CDS Logo.svg"
                            alt="CDS Logo"
                            className="w-[56px] sm:w-[60px] md:w-[68px] 2xl:w-[81.4px] h-[22px] sm:h-[24px] md:h-[26px] 2xl:h-[32px] object-contain"
                        />
                    </Link>

                    {/* Desktop Navigation Links Group */}
                    <div className="hidden md:flex items-center">
                        {navLinks.map((link) => (
                            <Link
                                key={link.name}
                                href={link.href}
                                className={cn(
                                    "px-3 2xl:px-4 py-[10px] 2xl:py-[13px] text-[15px] 2xl:text-[18px] font-medium transition-colors tracking-[-0.18px] whitespace-nowrap",
                                    pathname === link.href
                                        ? "text-brand-blue"
                                        : "text-brand-body hover:text-brand-blue"
                                )}
                            >
                                {link.name}
                            </Link>
                        ))}

                        {/* CDS Studio with Chevron Icon (Desktop) - Trigger ONLY on this wrapper */}
                        <div
                            className="relative group/studio"
                            onMouseEnter={() => !isMobileMenuOpen && setIsDropdownOpen(true)}
                            onMouseLeave={() => setIsDropdownOpen(false)}
                        >
                            <button className="flex items-center gap-1 px-3 2xl:px-4 py-[10px] 2xl:py-[13px] text-[15px] 2xl:text-[18px] font-medium text-brand-body hover:text-brand-blue transition-colors tracking-[-0.18px] cursor-pointer whitespace-nowrap group">
                                <span>CDS Studio</span>
                                <img
                                    src="/navbar/arrow-down-01.svg"
                                    alt="dropdown"
                                    className={cn(
                                        "w-5 2xl:w-6 h-5 2xl:h-6 opacity-70 transition-transform duration-300",
                                        isDropdownOpen && "rotate-180"
                                    )}
                                />
                            </button>
                        </div>
                    </div>

                    {/* Desktop Action Button */}
                    <div className="hidden md:flex items-center shrink-0 pr-1 2xl:pr-2">
                        <div className="bg-brand-bg/90 border border-brand-blue/25 p-[2px] rounded-[100px] shadow-[0_10px_24px_rgba(28,78,209,0.18)]">
                            <Link
                                href={accountHref}
                                className="flex items-center gap-2 px-4 2xl:px-5 py-2.5 2xl:py-[11px] rounded-[100px] text-[15px] 2xl:text-[18px] font-medium text-white transition-all hover:opacity-95 hover:scale-[0.99] tracking-[-0.18px] whitespace-nowrap"
                                style={{ background: 'var(--color-brand-gradient)' }}
                            >
                                My Account
                                <User className="w-4 2xl:w-5 h-4 2xl:h-5" strokeWidth={2.2} />
                            </Link>
                        </div>
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden flex h-10 w-10 items-center justify-center rounded-full text-[#040b37] transition-colors hover:bg-brand-bg focus:outline-none"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                    >
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </nav>

                {/* Desktop Dropdown Menu - RESTORED TO FULL WIDTH POSITION */}
                <div
                    className="hidden md:block"
                    onMouseEnter={() => setIsDropdownOpen(true)}
                    onMouseLeave={() => setIsDropdownOpen(false)}
                >
                    <AnimatePresence>
                        {isDropdownOpen && <StudioDropdown />}
                    </AnimatePresence>
                </div>

                {/* Mobile Menu Overlay */}
                <AnimatePresence>
                    {isMobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "calc(100dvh - 70px)" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="absolute top-[58px] sm:top-[62px] left-0 right-0 bg-white/95 backdrop-blur-md border-x border-b border-brand-stroke/20 rounded-b-[24px] shadow-2xl md:hidden overflow-hidden origin-top z-40"
                        >
                            <div className="flex flex-col h-full">
                                {/* Scrollable nav area — keeps the CTA pinned at the bottom */}
                                <div className="flex-1 overflow-y-auto px-5 sm:px-6 pt-5 sm:pt-6">
                                    <div className="space-y-3.5">
                                        {navLinks.map((link) => (
                                            <Link
                                                key={link.name}
                                                href={link.href}
                                                onClick={() => setIsMobileMenuOpen(false)}
                                                className={cn(
                                                    "block text-[1.5rem] sm:text-2xl font-semibold tracking-[-0.5px] transition-colors",
                                                    pathname === link.href ? "text-brand-blue" : "text-[#4b5563]"
                                                )}
                                            >
                                                {link.name}
                                            </Link>
                                        ))}

                                        <MobileStudioAccordion onClose={() => setIsMobileMenuOpen(false)} />
                                    </div>
                                </div>

                                {/* Mobile CTA — pinned */}
                                <div className="shrink-0 px-5 sm:px-6 pt-4 pb-5 sm:pb-6 border-t border-brand-stroke/10 bg-white/95">
                                    <Link
                                        href={accountHref}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex items-center justify-center gap-3 w-full py-3.5 sm:py-4 rounded-full text-base sm:text-lg font-semibold text-white transition-opacity hover:opacity-90"
                                        style={{ background: 'var(--color-brand-gradient)' }}
                                    >
                                        My Account
                                        <User className="w-5 h-5" strokeWidth={2.2} />
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </header>
    );
};
