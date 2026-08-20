"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

/**
 * High-Fidelity Pricing Section using exported assets
 * Scales for all screen sizes with right-click protection.
 */

export const Pricing = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => setIsLoggedIn(!!user));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setIsLoggedIn(!!session?.user));
        return () => subscription.unsubscribe();
    }, []);

    const handleGetStarted = () => {
        if (isLoggedIn) {
            window.location.href = "/dashboard/subscription";
            return;
        }
        setIsLoading(true);
        // Route through our own /api/auth/google/login so the Google consent
        // screen reads "to continue to cdsspace.com" instead of the Supabase URL.
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
        window.location.href = `${siteUrl}/api/auth/google/login?next=/subscription`;
    };

    return (
        <section className="w-full bg-brand-bg overflow-hidden" id="pricing">
            <div className="section-container flex flex-col items-center mb-20">

                {/* Header Group */}
                <div className="text-center max-w-[786px] mb-16 md:mb-20">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-[32px] md:text-[40px] lg:text-[48px] font-semibold text-brand-navy leading-[1.24] tracking-[-0.96px] mb-4"
                    >
                        Plans that best fit your needs
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-[16px] md:text-[18px] font-medium text-brand-body tracking-[-0.18px] max-w-[574px] mx-auto"
                    >
                        Choose a plan after a quick walkthrough. We tailor pricing to what you actually need.
                    </motion.p>
                </div>

                {/* Cards Image Container */}
                <div className="relative w-full max-w-[1200px] flex flex-col items-center select-none">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="w-full flex items-center justify-center"
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        <Image
                            src="/home/cards.svg"
                            alt="CDS Pricing Plans"
                            width={1200}
                            height={600}
                            className="w-full h-auto object-contain pointer-events-none"
                            draggable={false}
                            loading="lazy"
                        />
                    </motion.div>

                    {/* Get Started Button - Positioned on top of the white gradient */}
                    <motion.button
                        onClick={handleGetStarted}
                        disabled={isLoading}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="relative z-30 -mt-16 sm:-mt-24 md:-mt-40 lg:-mt-52 group p-[2px] rounded-full border border-[#648efc]/30 transition-all duration-300 hover:border-[#648efc] disabled:opacity-70 cursor-pointer"
                    >
                        <div
                            className="px-8 py-3.5 md:py-4 rounded-full text-[#F4F6FB] text-[16px] md:text-[18px] font-medium tracking-[-0.18px] transition-all duration-300"
                            style={{
                                background: "linear-gradient(146.284deg, #0035C1 8.8345%, #0575FF 86.298%)"
                            }}
                        >
                            {isLoading ? "Connecting..." : "Get Started"}
                        </div>
                    </motion.button>
                </div>
            </div>
        </section>
    );
};
