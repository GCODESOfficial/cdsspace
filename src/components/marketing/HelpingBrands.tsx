"use client";

import { SectionHeader } from "@/components/shared/SectionHeader";
import Image from "next/image";
import { motion } from "framer-motion";

const services = [
    {
        title: "Design & Development",
        assets: [
            { src: "/optimized/home/safeai-page-6.webp", width: 144, height: 118, left: 117.86, top: -21.03, rotate: 5.58, z: 10 },
            { src: "/optimized/home/rectangle-34133.webp", width: 144, height: 118, left: 46, top: -44, rotate: -14.95, z: 20 },
        ]
    },
    {
        title: "Brand Strategy",
        assets: [
            { src: "/optimized/home/tees-kitchen.webp", width: 104, height: 118, left: 3.04, top: -27.87, rotate: -17.44, z: 10 },
            { src: "/optimized/home/bullionz.webp", width: 104, height: 118, left: 183.03, top: -26.29, rotate: 14.74, z: 20 },
            { src: "/optimized/home/citywave.webp", width: 104, height: 118, left: 107.33, top: -45, rotate: 0, z: 15 },
        ]
    },
    {
        title: "Rollup Banners",
        assets: [
            { src: "/optimized/home/rollup-banner.webp", width: 104, height: 118, left: 58.67, top: -23.33, rotate: -13.46, z: 10 },
            { src: "/optimized/home/rollup-banner-01.webp", width: 104, height: 118, left: 132.59, top: -48, rotate: 12.91, z: 20 },
        ]
    },
    {
        title: "Event Branding",
        assets: [
            { src: "/optimized/home/rectangle-34137.webp", width: 144, height: 118, left: 120, top: -30, rotate: 2.84, z: 10 },
            { src: "/optimized/home/rectangle-34136.webp", width: 144, height: 118, left: 49, top: -50, rotate: -14.27, z: 20 },
        ]
    },
    {
        title: "Merch & Packaging",
        assets: [
            { src: "/optimized/home/overall-cloth.webp", width: 104, height: 118, left: 3.04, top: -35.87, rotate: -17.44, z: 10 },
            { src: "/optimized/home/immune-booster.webp", width: 104, height: 118, left: 183.03, top: -34.29, rotate: 14.74, z: 20 },
            { src: "/optimized/home/food-wrap.webp", width: 104, height: 118, left: 107.33, top: -53, rotate: 0, z: 15 },
        ]
    },
    {
        title: "Creative Support / Consulting",
        assets: [
            { src: "/optimized/home/rectangle-34137-1.webp", width: 144, height: 118, left: 44.67, top: -27.21, rotate: -3.85, z: 10 },
            { src: "/optimized/home/rectangle-34136-1.webp", width: 144, height: 118, left: 103.67, top: -50.37, rotate: 15.72, z: 20 },
        ]
    }
];

export const HelpingBrands = () => {
    return (
        <section className="py-16 md:py-24 lg:py-32 overflow-hidden bg-brand-bg" id="services">
            <div className="section-container">
                <SectionHeader
                    title="Helping brands take shape."
                    description="From early ideas to finished products, we help shape brands through design, production, and merch."
                    className="mb-24 lg:mb-32"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-20 max-w-[1000px] mx-auto px-6">
                    {services.map((service, idx) => (
                        <div key={service.title} className="flex flex-col items-center animate-reveal opacity-0" style={{ animationDelay: `${idx * 0.1}s` }}>
                            {/* The Floating Asset Container */}
                            <div className="w-[312px] h-[160px] bg-gradient-to-t from-white to-[#f4f6fb] rounded-[24px] relative group cursor-pointer border border-brand-stroke/50 shadow-sm transition-all duration-500 hover:shadow-xl hover:border-brand-blue/20 flex items-end justify-center pb-5">
                                {service.assets.map((asset, aIdx) => (
                                    <motion.div
                                        key={aIdx}
                                        className={`xl:w-[${asset.width}]! xl:h-[${asset.height}! absolute shadow-xl rounded-[16px] overflow-hidden border border-white bg-white`}
                                        style={{
                                            width: asset.width,
                                            height: asset.height,
                                            left: asset.left,
                                            top: asset.top,
                                            rotate: asset.rotate,
                                            zIndex: asset.z,

                                        }}
                                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                        whileInView={{ opacity: 1, scale: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        whileHover={{
                                            scale: 1.1,
                                            rotate: asset.rotate + (aIdx % 2 === 0 ? 5 : -5),
                                            y: -10,
                                            zIndex: 50
                                        }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 260,
                                            damping: 20,
                                            delay: (idx * 0.1) + (aIdx * 0.05)
                                        }}
                                    >
                                        <Image
                                            src={asset.src}
                                            alt={`${service.title} asset ${aIdx}`}
                                            fill
                                            quality={84}
                                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px"
                                            className="object-cover"
                                        />
                                    </motion.div>
                                ))}

                                <h3 className="relative z-[5] text-[18px] font-medium text-brand-body tracking-tight text-center leading-[1.24]">
                                    {service.title}
                                </h3>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
