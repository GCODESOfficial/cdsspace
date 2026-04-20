"use client";

import { motion } from "framer-motion";

import { useState } from "react";
import { BannerModal } from "./BannerModal";

/**
 * BannerHero - 1:1 Figma Alignment (Node 6113:26710)
 */
export const BannerHero = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <section className="w-full pt-[104px] bg-brand-bg relative overflow-hidden">
            <div className="max-w-full mx-auto flex flex-col items-center">
                {/* Dashed Framing - 842px boundary as per typical CDS hero patterns */}
                <div className="w-full max-w-[1232px] border-l border-r border-brand-stroke-ii border-dashed flex flex-col items-center pt-[104px] pb-[64px] relative px-6">

                    <div className="text-center max-w-[784px] mx-auto mb-8">
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[#040B37] text-[40px] md:text-[56px] font-semibold leading-[1.24] tracking-[-1.12px] mb-4"
                        >
                            Roll up banners
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-brand-body text-lg md:text-[20px] font-medium tracking-[-0.2px] max-w-[640px] mx-auto"
                        >
                            Explore our banner designs
                        </motion.p>
                    </div>

                    {/* Special CTA Button - Node 6140:11856 style */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="bg-[#f4f6fb] border border-[#648efc] p-[2px] rounded-[100px]"
                    >
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center justify-center px-[24px] py-[15px] rounded-[100px] text-[#f4f6fb] text-[18px] font-medium tracking-[-0.18px] transition-opacity hover:opacity-90 shadow-lg active:scale-[0.98] cursor-pointer"
                            style={{ backgroundImage: "linear-gradient(146.284deg, rgb(0, 53, 193) 8.8345%, rgb(5, 117, 255) 86.298%)" }}
                        >
                            Get your banner
                        </button>
                    </motion.div>
                </div>
            </div>

            <BannerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </section>
    );
};
