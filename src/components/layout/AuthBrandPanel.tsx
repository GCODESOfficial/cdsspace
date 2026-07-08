"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Star } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Testimonial {
    id?: string;
    name: string;
    review: string;
}

// Shown only until real testimonials load (or if none exist). Business-owned
// marketing copy - not attributed to specific named people.
const FALLBACK: Testimonial[] = [
    { name: "CDS Space client", review: "From strategy to launch, the team made our rebrand effortless - and faster than we imagined." },
    { name: "CDS Space client", review: "Clear communication, sharp design, and delivered ahead of schedule. Exactly what we needed." },
    { name: "CDS Space client", review: "They built a brand system our whole company now runs on every single day." },
];

/**
 * Branded left panel for the client auth screens (login / signup).
 * Blue brand-gradient background, white logo, rotating text-only client
 * testimonials, and a trust line - styled after the doola reference.
 */
export function AuthBrandPanel() {
    const [items, setItems] = useState<Testimonial[]>(FALLBACK);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        let active = true;
        supabase
            .from("testimonials")
            .select("id, name, review")
            .order("created_at", { ascending: true })
            .then(({ data }) => {
                if (active && Array.isArray(data) && data.length > 0) {
                    setItems(data as Testimonial[]);
                    setIndex(0);
                }
            });
        return () => { active = false; };
    }, []);

    // Keep the rotation set small so the dot indicator stays tidy.
    const pool = items.slice(0, 5);

    useEffect(() => {
        if (pool.length <= 1) return;
        const timer = setInterval(() => setIndex((p) => (p + 1) % pool.length), 5000);
        return () => clearInterval(timer);
    }, [pool.length]);

    const current = pool[index % pool.length];

    return (
        <div
            className="relative flex h-full w-full flex-col justify-between overflow-hidden p-10 xl:p-12"
            style={{ background: "var(--color-brand-gradient)" }}
        >
            {/* Depth: soft top glow + subtle dot grid */}
            <div
                className="pointer-events-none absolute left-1/2 top-[-160px] h-[420px] w-[320px] -translate-x-1/2 opacity-60 blur-[70px]"
                style={{ background: "radial-gradient(50% 50% at 50% 50%, #4DA0FF 0%, rgba(77,160,255,0) 100%)" }}
                aria-hidden="true"
            />
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.12]"
                style={{
                    backgroundImage: "radial-gradient(circle at 1.5px 1.5px, #ffffff 1px, transparent 0)",
                    backgroundSize: "38px 38px",
                }}
                aria-hidden="true"
            />

            {/* Top: logo + headline */}
            <div className="relative z-10 flex flex-col items-center text-center">
                <Image
                    src="/navbar/CDS Logo.svg"
                    alt="CDS Space"
                    width={116}
                    height={42}
                    priority
                    className="brightness-0 invert"
                />
                <h2 className="mt-10 max-w-[460px] text-balance text-[30px] font-bold leading-[1.15] text-white xl:text-[40px]">
                    Build your brand with <span className="text-sky-200">confidence</span>
                </h2>
                <p className="mt-4 max-w-[400px] text-[15px] leading-relaxed text-white/75">
                    Join the brands that trust CDS Space to design, build, and grow their identity.
                </p>
            </div>

            {/* Middle: rotating client testimonial (no images) */}
            <div className="relative z-10 mx-auto w-full max-w-[460px]">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={current?.id ?? `t-${index}`}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -14 }}
                        transition={{ duration: 0.4 }}
                        className="rounded-[24px] border border-white/15 bg-white/10 p-6 shadow-[0_20px_40px_rgba(0,0,0,0.18)] backdrop-blur-sm xl:p-7"
                    >
                        <div className="mb-3 flex gap-1" aria-hidden="true">
                            {Array.from({ length: 5 }).map((_, s) => (
                                <Star key={s} className="h-4 w-4 fill-white text-white" />
                            ))}
                        </div>
                        <p className="text-[16px] font-medium leading-relaxed text-white">
                            &ldquo;{current?.review}&rdquo;
                        </p>
                        <p className="mt-4 text-[14px] font-semibold text-white/85">{current?.name}</p>
                    </motion.div>
                </AnimatePresence>

                {pool.length > 1 && (
                    <div className="mt-5 flex justify-center gap-2">
                        {pool.map((_, d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setIndex(d)}
                                aria-label={`Show testimonial ${d + 1}`}
                                className={`h-1.5 rounded-full transition-all ${
                                    d === index % pool.length ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"
                                }`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom: trust line (replaces Trustpilot) */}
            <div className="relative z-10 flex flex-col items-center gap-2 text-center">
                <div className="flex items-center gap-1" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, s) => (
                        <Star key={s} className="h-4 w-4 fill-amber-300 text-amber-300" />
                    ))}
                </div>
                <p className="text-[14px] font-medium text-white/85">
                    Trusted by 1200+ businesses around the world
                </p>
            </div>
        </div>
    );
}
