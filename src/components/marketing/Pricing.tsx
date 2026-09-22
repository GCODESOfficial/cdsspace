"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

/**
 * High-Fidelity Pricing Section using exported assets
 * Scales for all screen sizes with right-click protection.
 */

export const Pricing = () => {
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
                    <Link href="/subscription/start" aria-label="Choose a CDS Space subscription plan" className="block w-full rounded-3xl focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="flex w-full items-center justify-center"
                            onContextMenu={(e) => e.preventDefault()}
                        >
                            <Image
                                src="/home/cards.svg"
                                alt="Startup, Scaleup and Supreme CDS Space subscription plans"
                                width={1200}
                                height={600}
                                className="h-auto w-full object-contain pointer-events-none"
                                draggable={false}
                                loading="lazy"
                            />
                        </motion.div>
                    </Link>

                    {/* Get Started Button - Positioned on top of the white gradient */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="relative z-30 -mt-16 rounded-full border border-[#648efc]/30 p-[2px] transition-all duration-300 hover:border-[#648efc] sm:-mt-24 md:-mt-40 lg:-mt-52"
                    >
                        <Link href="/subscription/start" className="block rounded-full bg-[#0A4FE8] px-8 py-3.5 text-[16px] font-medium text-[#F4F6FB] transition-colors duration-300 hover:bg-[#083EC0] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 md:py-4 md:text-[18px]">
                            Get Started
                        </Link>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};
