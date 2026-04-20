"use client";

import { motion } from "framer-motion";
import Image from "next/image";

/**
 * 1:1 Figma Implementation of the Brands Section
 * Node ID: 5428:779
 */

const stats = [
    { value: "1024+", label: "Top Brands" },
    { value: "50+", label: "Event Management" },
    { value: "256+", label: "Packaging Design" },
];

const topLogos = [
    "/home/brands/Frame 2147228406.svg",
    "/home/brands/Frame 2147228407.svg",
    "/home/brands/Frame 2147228408.svg",
    "/home/brands/Frame 2147228411.svg",
    "/home/brands/Frame 2147228406-2.svg",
];

const middleLogos = [
    "/home/brands/Frame 2147228407-1.svg",
    "/home/brands/Frame 2147228408-2.svg",
    "/home/brands/Frame 2147228409-1.svg",
    "/home/brands/Frame 2147228409-2.svg",
    "/home/brands/Frame 2147228410-1.svg",
];

const bottomLogos = [
    "/home/brands/Frame 2147228410-2.svg",
    "/home/brands/Frame 2147228411-2.svg",
    "/home/brands/Frame 2147228430-1.svg",
    "/home/brands/Frame 2147228431-1.svg",
    "/home/brands/Frame 2147228432-1.svg",
];

const LogoSlider = ({ logos, direction = "left", speed = 40 }: { logos: string[], direction?: "left" | "right", speed?: number }) => {
    // Triple the logos to ensure gapless loop
    const combinedLogos = [...logos, ...logos, ...logos];

    return (
        <div className="flex overflow-hidden relative w-full h-[104px]">
            <motion.div
                className="flex gap-1 items-center whitespace-nowrap"
                animate={{
                    x: direction === "left" ? [0, -1200] : [-1200, 0],
                }}
                transition={{
                    duration: speed,
                    repeat: Infinity,
                    ease: "linear",
                }}
            >
                {combinedLogos.map((logo, idx) => (
                    <div
                        key={idx}
                        className="w-[196px] h-[104px] bg-white flex items-center justify-center shrink-0 relative overflow-hidden group"
                    >
                        {/* Gray scale overlay by default, color on hover as per premium feel */}
                        <div className="relative w-full h-full flex items-center justify-center p-8 transition-all duration-500 hover:scale-110">
                            <Image
                                src={logo}
                                alt={`Brand Logo ${idx}`}
                                fill
                                className="object-contain opacity-60 group-hover:opacity-100 transition-all duration-500 px-6 py-4"
                            />
                        </div>
                    </div>
                ))}
            </motion.div>
        </div>
    );
};

export const Brands = () => {
    return (
        <section className="w-full bg-brand-bg py-16 md:py-24 lg:py-32 overflow-hidden" id="brands">
            <div className="w-full max-w-[1440px] mx-auto flex flex-col items-center">

                {/* Header Container - Node 5459:2294 */}
                <div className="flex flex-col items-center text-center w-full max-w-[900px] mb-12 md:mb-16 lg:mb-20 px-5 sm:px-6">
                    {/* Main Title - Node 5459:2295 */}
                    <h2 className="text-[30px] sm:text-[36px] md:text-[42px] lg:text-[48px] font-semibold text-[#040B37] leading-[1.12] tracking-[-0.04em] mb-6 md:mb-7 animate-reveal opacity-0" style={{ animationDelay: '0.1s' }}>
                        You’re in good company
                    </h2>

                    {/* Stats Row - Node 5677:62240 */}
                    <div className="grid w-full max-w-[720px] grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-0 animate-reveal opacity-0" style={{ animationDelay: '0.2s' }}>
                        {stats.map((stat, idx) => (
                            <div key={idx} className="relative flex justify-center sm:px-6 lg:px-8">
                                <div className="flex w-full max-w-[220px] flex-col items-center rounded-[18px] border border-brand-stroke/70 bg-white/70 px-4 py-4 sm:max-w-none sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                                    {/* Using Blue for values as per user's brand-sync screenshot request */}
                                    <span className="text-[24px] sm:text-[26px] md:text-[28px] font-semibold text-brand-body leading-[1.1] tracking-[-0.04em]">
                                        {stat.value}
                                    </span>
                                    <span className="mt-1 text-[14px] md:text-[16px] font-medium text-brand-body/90 leading-snug tracking-[-0.01em] text-center">
                                        {stat.label}
                                    </span>
                                </div>
                                {idx < stats.length - 1 && (
                                    <div className="hidden sm:block absolute right-0 top-1/2 h-16 w-px -translate-y-1/2 bg-brand-stroke-ii shrink-0" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sliders Container - Node 5645:964 (Width matched to 1200px from Figma) */}
                <div className="w-full max-w-[1200px] relative flex flex-col gap-1">
                    {/* Left & Right Side Fades - Node 5660:2626 & 5672:997 */}
                    <div className="absolute inset-y-0 left-0 w-[150px] md:w-[213px] bg-gradient-to-r from-brand-bg to-transparent z-[5] pointer-events-none" />
                    <div className="absolute inset-y-0 right-0 w-[150px] md:w-[213px] bg-gradient-to-l from-brand-bg to-transparent z-[5] pointer-events-none" />

                    {/* Top Slider - ID 6050:66999 */}
                    <LogoSlider logos={topLogos} direction="left" speed={30} />

                    {/* Middle Slider - ID 6056:17272 */}
                    <LogoSlider logos={middleLogos} direction="right" speed={35} />

                    {/* Bottom Slider - ID 6050:98686 */}
                    <LogoSlider logos={bottomLogos} direction="left" speed={40} />
                </div>
            </div>
        </section>
    );
};
