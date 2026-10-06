"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

type FullscreenRequestElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
};

function getFullscreenElement() {
    const doc = document as FullscreenDocument;

    return (
        doc.fullscreenElement ??
        doc.webkitFullscreenElement ??
        doc.msFullscreenElement
    );
}

function requestFullscreen(element: FullscreenRequestElement | null) {
    if (!element) return;

    const request =
        element.requestFullscreen ??
        element.webkitRequestFullscreen ??
        element.msRequestFullscreen;

    try {
        const result = request?.call(element);
        if (result && "catch" in result) {
            result.catch(() => undefined);
        }
    } catch {
        // Browsers may reject fullscreen when user activation is unavailable.
    }
}

/**
 * Hero Section - 10/10 Fidelity Implementation
 * Designed for 1440px, scaled fluidly for smaller desktop screens.
 */
export const Hero = () => {
    const [isReelOpen, setIsReelOpen] = useState(false);
    const playerShellRef = useRef<HTMLDivElement | null>(null);
    const mainVideoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        if (!isReelOpen) return;

        const shell = playerShellRef.current;
        const video = mainVideoRef.current;

        if (!getFullscreenElement()) {
            requestFullscreen(shell);
        }

        if (video) {
            video.currentTime = 0;
            video.play().catch(() => undefined);
        }

        const handleFullscreenChange = () => {
            if (!getFullscreenElement()) {
                setIsReelOpen(false);
            }
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
        document.addEventListener("MSFullscreenChange", handleFullscreenChange);

        return () => {
            video?.pause();
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
            document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
        };
    }, [isReelOpen]);

    const closeReel = async () => {
        const doc = document as FullscreenDocument;

        if (getFullscreenElement()) {
            const exitFullscreen =
                doc.exitFullscreen ??
                doc.webkitExitFullscreen ??
                doc.msExitFullscreen;

            try {
                const exit = exitFullscreen?.call(doc);
                if (exit && "catch" in exit) {
                    await exit.catch(() => undefined);
                }
            } catch {
                // Ignore fullscreen exit failures and return to the page shell.
            }
        }

        mainVideoRef.current?.pause();
        setIsReelOpen(false);
        window.setTimeout(() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }, 0);
    };

    const openReel = () => {
        requestFullscreen(document.documentElement);
        setIsReelOpen(true);
    };

    return (
        <section className="relative w-full pt-[116px] sm:pt-[132px] md:pt-[174px] pb-[88px] sm:pb-[120px] md:pb-[174px] overflow-hidden bg-brand-bg">
            {/* Background Decorative Elements - Exact Positioning from Figma Layers */}
            <div
                className="absolute left-[-72px] top-[88px] w-[140px] h-[140px] sm:left-[-106px] sm:top-[109px] sm:w-[190px] sm:h-[190px] bg-brand-blue/10 rounded-full blur-[80px] pointer-events-none"
                aria-hidden="true"
            />
            <div
                className="absolute hidden sm:block left-[329px] top-[328px] w-[118px] h-[118px] bg-brand-blue/5 rounded-full blur-[60px] pointer-events-none"
                aria-hidden="true"
            />

            <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-5 md:px-10 flex flex-col items-center">
                {/* Main Content Container - Centered fluidly */}
                <div className="relative w-full max-w-[1200px] flex flex-col items-center">
                    {/* Guide lines - span from the top of the hero down to the video, aligned with the navbar edges */}
                    <div
                        className="absolute left-1/2 -translate-x-1/2 w-[100vw] top-[-116px] sm:top-[-132px] md:top-[-174px] bottom-[-56px] sm:bottom-[-64px] md:bottom-[-104px] pointer-events-none"
                        aria-hidden="true"
                    >
                        <div className="absolute inset-x-0 top-[90px] sm:top-[98px] md:top-[112px] 2xl:top-[118px] border-t border-brand-stroke-ii" />
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 hidden md:block w-full max-w-[920px] xl:max-w-[1080px] 2xl:max-w-[1140px]">
                            <div className="absolute left-0 top-0 h-[112px] 2xl:h-[118px] border-l border-dashed border-brand-stroke-ii" />
                            <div className="absolute right-0 top-0 h-[112px] 2xl:h-[118px] border-r border-dashed border-brand-stroke-ii" />
                            <div className="absolute left-0 top-[112px] 2xl:top-[118px] bottom-0 border-l border-brand-stroke-ii" />
                            <div className="absolute right-0 top-[112px] 2xl:top-[118px] bottom-0 border-r border-brand-stroke-ii" />
                        </div>
                    </div>


                    {/* 1. Status Badge - Node 5379:854 (y=104px) */}
                    <div
                        className="flex flex-wrap items-center justify-center gap-2 px-3 py-2 bg-[#e6ebf7] border border-white rounded-[8px] animate-reveal opacity-0"
                        style={{ animationDelay: '0.1s' }}
                        data-node-id="5379:854"
                    >
                        <span className="text-[14px] md:text-[16px] font-semibold text-[#4B5563] leading-none tracking-[-0.16px]">
                            CDS Space
                        </span>
                        <div className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]"></span>
                        </div>
                        <span className="text-[14px] md:text-[16px] font-medium text-[#4B5563] leading-none tracking-[-0.16px]">
                            Available for work
                        </span>
                    </div>

                    {/* 2. Main Headline - Node 5371:839 (y=171px, gap=32px) */}
                    <h1
                        className="mt-6 md:mt-8 text-[29px] sm:text-[40px] md:text-[48px] lg:text-[56px] font-semibold text-[#040B37] text-center leading-[1.15] md:leading-[1.24] tracking-[-0.8px] md:tracking-[-1.12px] max-w-[784px] animate-reveal opacity-0 text-balance"
                        style={{ animationDelay: '0.2s' }}
                        data-node-id="5371:839"
                    >
                        We build brands that grow with your business.
                    </h1>

                    {/* 3. Sub-headline - Node 5367:837 (y=341px, gap=32px) */}
                    <p
                        className="mt-5 md:mt-8 text-[15px] sm:text-[18px] lg:text-[20px] font-medium text-[#4B5563] text-center leading-[1.5] tracking-[-0.2px] max-w-[580px] animate-reveal opacity-0 px-1 sm:px-2 text-pretty"
                        style={{ animationDelay: '0.3s' }}
                        data-node-id="5367:837"
                    >
                        From strategy to execution, CDS designs digital brands that scale, convert, and stay consistent.
                    </p>

                    {/* 4. Hero actions - side by side on larger screens, stacked on mobile */}
                    <div
                        className="mt-8 flex w-full max-w-[340px] flex-col gap-3 opacity-0 animate-reveal sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:justify-center"
                        style={{ animationDelay: '0.4s' }}
                        data-node-id="5808:4936"
                    >
                        <Link
                            href="/consultation"
                            className="flex w-full items-center justify-center whitespace-nowrap rounded-[100px] border border-brand-blue bg-brand-blue px-8 py-[15px] text-[16px] font-medium tracking-[-0.18px] text-white shadow-[0_10px_24px_rgba(10,79,232,0.18)] transition-colors hover:bg-[#0843c7] sm:w-auto md:text-[18px]"
                        >
                            <span>Schedule a Strategy Session</span>
                        </Link>
                        <Link
                            href="/login"
                            className="flex w-full items-center justify-center whitespace-nowrap rounded-[100px] border border-brand-blue bg-transparent px-8 py-[15px] text-[16px] font-medium tracking-[-0.18px] text-brand-blue transition-colors hover:bg-brand-blue/5 sm:w-auto md:text-[18px]"
                        >
                            <span>My Account</span>
                        </Link>
                    </div>
                </div>

                {/* 5. Video Section - Cinematic Reel Overlay Implementation */}
                <div
                    className="mt-14 sm:mt-16 md:mt-[104px] w-full max-w-[1408px] aspect-[370/290] sm:aspect-[1408/981] rounded-[16px] md:rounded-[24px] bg-[#040B37] relative overflow-hidden animate-reveal opacity-0 shadow-[0_12px_24px_rgba(4,11,55,0.1),0_32px_64px_rgba(4,11,55,0.15)] group cursor-pointer"
                    style={{ animationDelay: '0.5s' }}
                    data-node-id="5272:37295"
                    onClick={openReel}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openReel();
                        }
                    }}
                    aria-label="Watch CDS Space reel"
                >
                    {/* The video element with exactly matched rounding and behavior */}
                    <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 w-full h-full object-cover rounded-[16px] md:rounded-[24px]"
                        aria-label="CDS Space reel preview"
                    >
                        <source src="/videos/cds-preview.mp4" type="video/mp4" />
                    </video>

                    {/* Cinematic Hover Overlay */}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all duration-500 backdrop-blur-[2px] flex items-center justify-center">
                        <div className="relative w-full h-full flex flex-col items-center justify-center">
                            {/* Watch Reel Circle - Exactly from Figma 10/10 Fidelity */}
                            <motion.div
                                whileHover={{ scale: 1.1 }}
                                className="w-[92px] h-[92px] sm:w-[120px] sm:h-[120px] md:w-[160px] md:h-[160px] bg-black rounded-full flex items-center justify-center shadow-2xl z-20"
                            >
                                <span className="text-white text-center font-semibold text-[11px] sm:text-[14px] md:text-[18px] leading-tight flex flex-col">
                                    <span>WATCH</span>
                                    <span>REEL</span>
                                </span>
                            </motion.div>

                            {/* CDS Branding on Video Overlay */}
                            <div className="absolute left-8 md:left-12 bottom-8 md:bottom-12 flex flex-col items-start gap-2 z-20">
                                <Image
                                    src="/navbar/CDS Logo.svg"
                                    alt="CDS"
                                    width={96}
                                    height={36}
                                    loading="lazy"
                                    className="w-16 md:w-24 brightness-0 invert opacity-90"
                                />
                                <div className="flex items-center gap-2">
                                    <span className="text-white/80 font-medium text-[14px] md:text-[18px]">2024+</span>
                                    <div className="w-4 h-4 rounded-full border border-white/40 flex items-center justify-center">
                                        <div className="w-1 h-1 bg-white rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isReelOpen && (
                <div
                    ref={playerShellRef}
                    className="fixed inset-0 z-[300] flex flex-col bg-black text-white"
                    role="dialog"
                    aria-modal="true"
                    aria-label="CDS Space main reel"
                >
                    <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6">
                        <button
                            type="button"
                            onClick={closeReel}
                            className="rounded-full border border-white/20 bg-white px-5 py-3 text-[14px] font-semibold text-[#040B37] shadow-[0_16px_40px_rgba(0,0,0,0.22)] transition hover:bg-white/90 focus:outline-none focus:ring-4 focus:ring-white/30"
                        >
                            Back to home
                        </button>
                    </div>

                    <video
                        ref={mainVideoRef}
                        src="/videos/video-main.mp4"
                        controls
                        autoPlay
                        playsInline
                        preload="metadata"
                        className="h-full w-full bg-black object-contain"
                        onEnded={closeReel}
                    />
                </div>
            )}
        </section>
    );
};
