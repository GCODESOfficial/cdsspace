"use client";

import { motion } from "framer-motion";

/**
 * LocationHero - 1:1 Figma Alignment (Node 6224:23146)
 * Displays the CDS Headquarters address and landing metrics.
 */
export const LocationHero = () => {
    return (
        <section className="w-full pt-[104px] bg-brand-bg relative overflow-hidden">
            <div className="max-w-[1200px] mx-auto border-l border-r border-[#C8D1E0] border-solid flex flex-col items-center">
                <div className="w-full px-6 md:px-12 py-16 flex flex-col md:flex-row items-start md:items-end justify-between gap-8 md:gap-0">

                    {/* Address Section */}
                    <div className="flex flex-col gap-2">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-brand-body text-base md:text-lg font-medium tracking-tight"
                        >
                            <p>No. 53 General Edet Akpan Ave,</p>
                            <p>Uyo, NG</p>
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-brand-navy text-[40px] md:text-[56px] font-bold leading-none tracking-[-0.8px] md:tracking-[-1.12px]"
                        >
                            520101
                        </motion.div>
                    </div>

                    {/* Stats Section */}
                    <div className="flex flex-col items-start md:items-end gap-2 text-left md:text-right">
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-brand-body text-base md:text-lg font-medium tracking-tight"
                        >
                            Distance to arrival
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-[40px] md:text-[56px] font-bold leading-none tracking-[-0.8px] md:tracking-[-1.12px]"
                        >
                            <span className="text-brand-blue">8,576</span>
                            <span className="text-brand-body/40">/6,990</span>
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    );
};
