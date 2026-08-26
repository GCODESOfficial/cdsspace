"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
        // Defer the DB round-trip until the browser is idle so it never competes
        // with first paint / hydration. Older Safari and embedded mobile browsers
        // do not expose requestIdleCallback, so use a short timer fallback instead
        // of letting the auth tree crash during hydration.
        const run = () => {
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
        };

        const supportsIdleCallback = typeof window.requestIdleCallback === "function";
        const handle = supportsIdleCallback
            ? window.requestIdleCallback(run, { timeout: 2500 })
            : window.setTimeout(run, 250);

        return () => {
            active = false;
            if (supportsIdleCallback && typeof window.cancelIdleCallback === "function") {
                window.cancelIdleCallback(handle);
            } else {
                window.clearTimeout(handle);
            }
        };
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
            className="relative flex h-full w-full flex-col justify-start gap-[32px] overflow-hidden bg-brand-blue p-6 sm:p-8 lg:justify-between lg:gap-0 lg:p-10 xl:p-12"
        >
            {/* Depth: soft top glow + subtle dot grid */}
            <div
                className="pointer-events-none absolute left-1/2 top-[-160px] h-[420px] w-[320px] -translate-x-1/2 rounded-full bg-white/10 opacity-60 blur-[70px]"
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
            <div className="relative z-10 flex flex-col items-center gap-[32px] text-center lg:gap-0">
                <Image
                    src="/navbar/CDS Logo.svg"
                    alt="CDS Space"
                    width={116}
                    height={42}
                    priority
                    className="brightness-0 invert"
                />
                <h2 className="max-w-[460px] text-balance text-[28px] font-bold leading-[1.15] text-white sm:text-[30px] lg:mt-10 xl:text-[40px]">
                    Build your brand with <span className="text-sky-200">confidence</span>
                </h2>
                <p className="max-w-[400px] text-[15px] leading-relaxed text-white/75 lg:mt-4">
                    Join the brands that trust CDS Space to design, build, and grow their identity.
                </p>
            </div>

            {/* Middle: rotating client testimonial (no images) */}
            <div className="relative z-10 mx-auto flex w-full max-w-[460px] flex-col gap-[32px] lg:block">
                {/* Lightweight CSS crossfade (no framer-motion): the card remounts
                    on key change and replays the fade, keeping the auth bundle small. */}
                <style>{"@keyframes authFadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}"}</style>
                <div
                    key={current?.id ?? `t-${index}`}
                    style={{ animation: "authFadeUp 0.4s ease" }}
                    className="rounded-[24px] border border-white/15 bg-white/10 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:p-6 xl:p-7"
                >
                    <div className="mb-[32px] flex gap-1 lg:mb-3" aria-hidden="true">
                        {Array.from({ length: 5 }).map((_, s) => (
                            <Star key={s} className="h-4 w-4 fill-white text-white" />
                        ))}
                    </div>
                    <p className="text-[16px] font-medium leading-relaxed text-white">
                        &ldquo;{current?.review}&rdquo;
                    </p>
                    <p className="mt-[32px] text-[14px] font-semibold text-white/85 lg:mt-4">{current?.name}</p>
                </div>

                {pool.length > 1 && (
                    <div className="flex justify-center gap-2 lg:mt-5">
                        {pool.map((_, d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setIndex(d)}
                                aria-label={`Show testimonial ${d + 1}`}
                                className={`!h-1.5 !min-h-0 !min-w-0 !rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${
                                    d === index % pool.length ? "!w-6 bg-white" : "!w-1.5 bg-white/40 hover:bg-white/60"
                                }`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom: business verification and trust line */}
            <div className="relative z-10 flex flex-col items-center gap-0 text-center sm:gap-[21px] lg:gap-2">
                <Image
                    src="/DUNS.svg"
                    alt="Dun & Bradstreet D-U-N-S Registered"
                    width={209}
                    height={184}
                    className="h-[269px] w-[269px] max-w-none object-contain sm:h-24 sm:w-24 xl:h-28 xl:w-28"
                />
                <p className="text-[14px] font-medium text-white/85">
                    Trusted by 1200+ businesses around the world
                </p>
            </div>
        </div>
    );
}
