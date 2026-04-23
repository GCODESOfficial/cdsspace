"use client";

import { motion } from "framer-motion";
import Image from "next/image";

/**
 * BannerGallery - 1:1 Figma Alignment (Node 6140:11860)
 */
export const BannerGallery = () => {
    // Mock data based on Figma screenshot
    const banners = [
        { id: 1, src: "/banners/source/Rollup Banner.svg"}, // Environment shot
        { id: 2, src: "/banners/source/product card-1.svg"}, // Reddish bg
        { id: 3, src: "/banners/source/product card.svg"}, // Grayish bg
        { id: 4, src: "/banners/product card-1.svg"},// Deep blue bg
        { id: 5, src: "/banners/Rollup Banner 01.svg"}, // Blue bg
        { id: 6, src: "/banners/product card.svg"}  // Pink bg
    ];

    return (
        <section className="w-full pb-32 bg-brand-bg relative overflow-hidden">
            <div className="max-w-[1232px] mx-auto border-l border-r border-dashed border-[#C8D1E0] px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {banners.map((banner, index) => (
                        <motion.div
                            key={banner.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            viewport={{ once: true }}
                            className={`relative aspect-[458/600] rounded-[24px] overflow-hidden group shadow-sm border border-brand-stroke-ii`}
                        >
                            {/* In a real scenario, these would be actual images from the /public folder */}
                            {/* Since I cannot upload files, I'm setting up the structure with relative paths */}
                            <Image
                                src={banner.src}
                                alt={`Banner design ${banner.id}`}
                                fill
                                quality={90}
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            />

                            {/* Subtle overlay on hover */}
                            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
