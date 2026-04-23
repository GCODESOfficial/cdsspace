"use client";

import { motion } from "framer-motion";
import Image from "next/image";

/**
 * MerchGallery - 1:1 Design Logic
 * Features a responsive grid that stacks vertically on mobile.
 */
export const MerchGallery = () => {
    // Placeholder merch designs
    const merchItems = [
        { id: 1, src: "/merch/Rollup Mockup.svg", label: "Premium T-shirt" },
        { id: 2, src: "/merch/Cup mockup.svg", label: "Branded Hoodie" },
        { id: 3, src: "/merch/T-shirt Yellow.svg", label: "Custom Tote Bag" },
        { id: 4, src: "/merch/Apron - Orange.svg", label: "Team Cap" },
        { id: 5, src: "/merch/product card-1.svg", label: "Tech Sleeve" },
        { id: 6, src: "/merch/tshirt.svg", label: "Desk Mat" },
        { id: 4, src: "/merch/SMC Store-33.svg", label: "Team Cap" },
        { id: 4, src: "/merch/SMC Store-26.svg", label: "Team Cap" },
        { id: 6, src: "/merch/product card-1.svg", label: "Desk Mat" }
    ];

    return (
        <section className="w-full bg-brand-bg relative overflow-hidden">
            <div className="w-full mx-auto border-l border-r border-dashed border-brand-stroke-ii px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {merchItems.map((item, index) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            viewport={{ once: true }}
                            className="relative aspect-458/600 rounded-[24px] overflow-hidden group shadow-sm border border-brand-stroke-ii bg-white"
                        >
                            <Image
                                src={item.src}
                                alt={item.label}
                                fill
                                quality={90}
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            />

                            {/* Subtle Brand Overlay */}
                            <div className="absolute inset-0 bg-brand-navy/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
