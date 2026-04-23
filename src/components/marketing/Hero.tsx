"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Hero Section - 10/10 Fidelity Implementation
 * Designed for 1440px, scaled fluidly for smaller desktop screens.
 */
export const Hero = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // Check auth status to match My Account behavior
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
                <div className="w-full max-w-[1200px] flex flex-col items-center">

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

                    {/* 4. CTA Button Group - Node 5808:4936 (y=421px, gap=32px) */}
                    <div
                        className="mt-8 p-[2px] bg-[#F4F6FB] border border-[#648EFC] rounded-[100px] animate-reveal opacity-0 w-full max-w-[340px] sm:w-auto sm:max-w-none flex justify-center"
                        style={{ animationDelay: '0.4s' }}
                        data-node-id="5808:4936"
                    >
                        <Link
                            href={accountHref}
                            className="flex items-center justify-center px-8 py-[15px] rounded-[100px] text-[16px] md:text-[18px] font-medium text-brand-bg transition-opacity hover:opacity-90 tracking-[-0.18px] whitespace-nowrap w-full sm:w-auto"
                            style={{ background: 'var(--color-brand-gradient)' }}
                        >
                            <span>Explore the Branding Space</span>
                        </Link>
                    </div>
                </div>

                {/* 5. Video Section - Cinematic Reel Overlay Implementation */}
                <div
                    className="mt-14 sm:mt-16 md:mt-[104px] w-full max-w-[1408px] aspect-[370/290] sm:aspect-[1408/981] rounded-[16px] md:rounded-[24px] bg-[#040B37] relative overflow-hidden animate-reveal opacity-0 shadow-[0_12px_24px_rgba(4,11,55,0.1),0_32px_64px_rgba(4,11,55,0.15)] group cursor-pointer"
                    style={{ animationDelay: '0.5s' }}
                    data-node-id="5272:37295"
                    onClick={() => {
                        const video = document.getElementById('hero-reel') as HTMLVideoElement;
                        if (video) {
                            if (video.requestFullscreen) {
                                video.requestFullscreen();
                            } else if ((video as any).webkitRequestFullscreen) {
                                (video as any).webkitRequestFullscreen();
                            } else if ((video as any).msRequestFullscreen) {
                                (video as any).msRequestFullscreen();
                            }
                            video.muted = false;
                            video.currentTime = 0;
                            video.play();
                        }
                    }}
                >
                    {/* The video element with exactly matched rounding and behavior */}
                    <video
                        id="hero-reel"
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover rounded-[16px] md:rounded-[24px]"
                    >
                        <source src="/home/CDS Space Branding Agency.mp4" type="video/mp4" />
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
                                <img
                                    src="/navbar/CDS Logo.svg"
                                    alt="CDS"
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
        </section>
    );
};
