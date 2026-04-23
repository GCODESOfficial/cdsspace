"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { MerchModal } from "./MerchModal";

/**
 * MerchHero - 1:1 Figma Alignment
 * Replicates the successful BannerHero architecture for Merch services.
 */
export const MerchHero = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <section className="w-full pt-[58px] sm:pt-[76px] md:pt-[104px] bg-brand-bg relative overflow-hidden">
            <div className="max-w-full mx-auto flex flex-col items-center border-t border-brand-stroke-ii">
                
                {/* 1. Header Section - Node 5909:33315 (842px wide boundary) */}
                <div className="w-full max-w-[842px] sm:border-l sm:border-r border-[#c8d1e0] border-solid flex flex-col items-center pt-[56px] sm:pt-[72px] md:pt-[104px] relative pb-12 sm:pb-16 px-4 sm:px-0">
                    
                    {/* Headline - Node 5909:33320 */}
                    <div className="text-center px-1 sm:px-6 mb-8 sm:mb-[40px] w-full max-w-[784px]">
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-brand-navy text-[30px] sm:text-[40px] md:text-[56px] font-semibold leading-[1.12] md:leading-[1.24] tracking-[-1px] md:tracking-[-1.12px] mb-4 text-balance"
                        >
                            Custom Merch
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-brand-body text-[15px] sm:text-lg md:text-[20px] font-medium tracking-[-0.2px] max-w-[640px] mx-auto text-pretty"
                        >
                            Premium branded apparel and accessories for your team and clients.
                        </motion.p>
                    </div>

                    {/* Premium CTA Button */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="bg-[#f4f6fb] border border-[#648efc] p-[2px] rounded-[100px]"
                    >
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center justify-center px-5 sm:px-[24px] py-[14px] sm:py-[15px] rounded-[100px] text-[#f4f6fb] text-base sm:text-[18px] font-medium tracking-[-0.18px] transition-opacity hover:opacity-90 shadow-lg active:scale-[0.98] cursor-pointer"
                            style={{ backgroundImage: "linear-gradient(153.9deg, #0035C1 8.83%, #0575FF 86.3%)" }}
                        >
                            Get your merch
                        </button>
                    </motion.div>
                </div>
            </div>

            <MerchModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </section>
    );
};
