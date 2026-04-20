"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// Cosmic interactive starfield
function CosmicStarfield() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

    // Generate stars once on mount (deterministic per mount)
    const stars = useMemo(() => {
        return Array.from({ length: 120 }).map((_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 2 + 0.5,
            baseOpacity: Math.random() * 0.5 + 0.2,
            twinkleDelay: Math.random() * 5,
        }));
    }, []);

    // Generate shooting stars (periodically respawn)
    const [shootingStars, setShootingStars] = useState<{ id: number; top: number; left: number; angle: number }[]>([]);

    useEffect(() => {
        const interval = setInterval(() => {
            const id = Date.now();
            setShootingStars((prev) => [
                ...prev.slice(-3),
                {
                    id,
                    top: Math.random() * 60,
                    left: Math.random() * 80,
                    angle: 30 + Math.random() * 30,
                },
            ]);
            setTimeout(() => {
                setShootingStars((prev) => prev.filter((s) => s.id !== id));
            }, 1500);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setMouse({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
        });
    };

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMouse(null)}
            className="absolute inset-0 overflow-hidden pointer-events-auto"
            aria-hidden="true"
        >
            {/* Animated nebula glow follows cursor */}
            {mouse && (
                <div
                    className="absolute pointer-events-none transition-opacity duration-300"
                    style={{
                        left: `${mouse.x}%`,
                        top: `${mouse.y}%`,
                        transform: "translate(-50%, -50%)",
                        width: "300px",
                        height: "300px",
                        background: "radial-gradient(circle, rgba(91,168,255,0.15) 0%, rgba(91,168,255,0) 70%)",
                        filter: "blur(20px)",
                    }}
                />
            )}

            {/* Stars */}
            {stars.map((star) => {
                let glow = 0;
                let scale = 1;
                if (mouse) {
                    const dx = star.x - mouse.x;
                    const dy = star.y - mouse.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < 12) {
                        glow = 1 - distance / 12;
                        scale = 1 + glow * 1.8;
                    }
                }

                const isHovered = glow > 0.05;

                return (
                    <div
                        key={star.id}
                        className="absolute rounded-full transition-all duration-300 ease-out"
                        style={{
                            left: `${star.x}%`,
                            top: `${star.y}%`,
                            width: `${star.size}px`,
                            height: `${star.size}px`,
                            transform: `translate(-50%, -50%) scale(${scale})`,
                            background: isHovered
                                ? `rgba(120, 180, 255, ${0.9 * glow + 0.5})`
                                : `rgba(255, 255, 255, ${star.baseOpacity})`,
                            boxShadow: isHovered
                                ? `0 0 ${8 + glow * 16}px ${2 + glow * 4}px rgba(91, 168, 255, ${0.6 * glow + 0.2}), 0 0 ${4 + glow * 8}px rgba(120, 180, 255, 0.8)`
                                : "none",
                            animation: !isHovered ? `cta-twinkle 4s ease-in-out infinite` : "none",
                            animationDelay: `${star.twinkleDelay}s`,
                        }}
                    />
                );
            })}

            {/* Shooting stars */}
            {shootingStars.map((s) => (
                <div
                    key={s.id}
                    className="absolute pointer-events-none"
                    style={{
                        top: `${s.top}%`,
                        left: `${s.left}%`,
                        transform: `rotate(${s.angle}deg)`,
                    }}
                >
                    <div className="cosmic-shooting-star" />
                </div>
            ))}

            <style jsx>{`
                @keyframes cta-twinkle {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 1; }
                }
                .cosmic-shooting-star {
                    width: 80px;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(91,168,255,0.9), white);
                    border-radius: 999px;
                    box-shadow: 0 0 6px rgba(91,168,255,0.8);
                    animation: shoot 1.5s ease-out forwards;
                    transform-origin: left center;
                }
                @keyframes shoot {
                    0% { opacity: 0; transform: translateX(0) scaleX(0.2); }
                    20% { opacity: 1; }
                    100% { opacity: 0; transform: translateX(300px) scaleX(1); }
                }
            `}</style>
        </div>
    );
}

/**
 * 1:1 Figma Implementation of the CTA Section
 * Node ID: 5694:935
 */

export const CTA = () => {
    return (
        <section className="w-full py-16 md:py-24 lg:py-32 bg-brand-bg overflow-hidden px-4 md:px-6 lg:px-10 pt-0!" id="cta">
            <div className="w-full h-full max-w-full">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="relative w-full aspect-auto md:aspect-1408/680 min-h-[480px] md:min-h-0 py-20 md:py-0 rounded-[24px] bg-[#040B37] flex flex-col items-center justify-center text-center overflow-hidden px-6"
                >
                    {/* Cosmic Interactive Starfield */}
                    <CosmicStarfield />

                    {/* Background Effects */}
                    {/* Radial Glow - Top Center */}
                    <div
                        className="absolute top-[-222.5px] left-1/2 -translate-x-1/2 w-[367px] h-[563px] mix-blend-plus-lighter pointer-events-none opacity-60"
                        style={{
                            background: "radial-gradient(50% 50% at 50% 50%, #0575FF 0%, rgba(5, 117, 255, 0) 100%)",
                            filter: "blur(60px)"
                        }}
                    />

                    {/* Vector Edges - Bottom Left (Mirrored) left-[-60px] top-[201px]  mix-blend-color-dodge */}
                    <div className="w-[659px] h-[530px] absolute left-0 pointer-events-none opacity-30 select-none hidden lg:block bottom-0 mix-blend-color-dodge">
                        <div className="relative w-full h-full">
                            <Image
                                src="/home/assets/Objects2.svg"
                                alt="Decorative geometric lines"
                                fill
                                className="object-cover"
                            />
                        </div>
                    </div>

                    {/* Vector Edges - Bottom Right left-[807px] top-[183px] w-[661px] h-[531px] mix-blend-color-dodge w-full h-full -scale-y-100*/}
                    <div className="w-[661px] h-[531px] absolute right-0 pointer-events-none opacity-30 select-none hidden lg:block bottom-0">
                        <div className="relative w-full h-full">
                            <Image
                                src="/home/assets/Objects.svg"
                                alt="Decorative geometric lines"
                                fill
                                className="object-cover"
                            />
                        </div>
                    </div>

                    {/* Dot Patterns - Left & Right */}
                    <div className="absolute inset-0 pointer-events-none opacity-20">
                        <div
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-full"
                            style={{
                                backgroundImage: `radial-gradient(circle at 1.5px 1.5px, #ffffff 1px, transparent 0)`,
                                backgroundSize: "40px 40px",
                                maskImage: "radial-gradient(circle at left, black, transparent 60%)"
                            }}
                        />
                        <div
                            className="absolute right-0 top-1/2 -translate-y-1/2 w-full h-full"
                            style={{
                                backgroundImage: `radial-gradient(circle at 1.5px 1.5px, #ffffff 1px, transparent 0)`,
                                backgroundSize: "40px 40px",
                                maskImage: "radial-gradient(circle at right, black, transparent 60%)"
                            }}
                        />
                    </div>

                    {/* Content Container - Node 5694:4317 */}
                    <div className="relative z-20 flex flex-col items-center max-w-[784px] w-full gap-8 md:gap-10 pointer-events-none">

                        {/* Heading & Subtext Group - Node 5694:4318 */}
                        <div className="flex flex-col items-center gap-5 w-full">
                            <h2
                                className="text-4xl md:text-5xl lg:text-[64px] font-semibold text-white leading-[1.24] tracking-[-1.28px] max-w-[540px] text-balance"
                            >
                                Design without downtime
                            </h2>
                            <p
                                className="text-base md:text-[18px] font-medium text-brand-mute tracking-[-0.18px] max-w-[540px] leading-relaxed"
                            >
                                A 24/7 branding and digital design agency connecting people, brands, and culture across Web2 and Web3.
                            </p>
                        </div>

                        {/* Special Button + Icon - Node 5808:5079 */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="group relative p-[2px] rounded-full border border-[#648efc]/30 flex items-center justify-center transition-all duration-300 hover:border-[#648efc] pointer-events-auto"
                        >
                            <div
                                className="flex items-center gap-2 px-6 py-3.5 md:px-[24px] md:py-[14px] rounded-full text-brand-bg text-sm md:text-[18px] font-medium tracking-[-0.18px] transition-all duration-300"
                                style={{
                                    background: "linear-gradient(153.896deg, #0035C1 8.8345%, #0575FF 86.298%)"
                                }}
                            >
                                <span>About Us</span>
                                <ArrowUpRight className="w-5 h-5 md:w-6 md:h-6 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </div>
                        </motion.button>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};
