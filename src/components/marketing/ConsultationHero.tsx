"use client";

import { motion } from "framer-motion";

/**
 * ConsultationHero - 1:1 Figma Alignment (Node 6083:15045)
 */
export const ConsultationHero = () => {
    return (
        <section className="w-full pt-[58px] sm:pt-[76px] md:pt-[104px] bg-brand-bg relative overflow-hidden">
            {/* Dashed Border Frame */}

            <div className="max-w-full mx-auto flex flex-col items-center border-t border-brand-stroke-ii">

                {/* 1. Header Section - Node 5909:33315 (842px wide boundary) */}
                <div className="w-full max-w-[842px] sm:border-l sm:border-r border-[#c8d1e0] border-solid flex flex-col items-center pt-[56px] sm:pt-[72px] md:pt-[104px] relative px-4 sm:px-0">

                    {/* Headline - Node 5909:33320 */}
                    <div className="text-center px-1 sm:px-6 mb-8 sm:mb-[40px] w-full max-w-[784px]">
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[#040B37] text-[2rem] sm:text-4xl md:text-[64px] font-bold leading-[1.08] md:leading-[1.1] tracking-[-1.3px] md:tracking-[-2.56px] mb-5 sm:mb-6 text-balance"
                        >
                            Book a consultation
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-[#4B5563] text-[15px] sm:text-lg md:text-xl font-medium leading-[1.6] text-pretty"
                        >
                            Talk to our team and see how we can help your brand grow.
                            Share your goals and we’ll plan the next steps together.
                        </motion.p>
                    </div>
                </div>
            </div>
        </section>
    );
};
