"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * AboutHero Component - 1:1 Figma Implementation
 * Node IDs: 5909:33314, 5909:33315, 5914:10075
 */
export const AboutHero = () => {
    const values = [
        "Excellence",
        "Limitlessness",
        "Professionalism",
        "Innovation",
        "Culture"
    ];

    return (
        <section className="relative w-full bg-brand-bg pt-[104px] pb-24 overflow-hidden">
            
            {/* Main Content Wrapper - Framing Borders */}
            <div className="max-w-full mx-auto flex flex-col items-center border-t border-brand-stroke-ii">
                
                {/* 1. Header Section - Node 5909:33315 (842px wide boundary) */}
                <div className="w-full max-w-[842px] border-l border-r border-[#c8d1e0] border-solid flex flex-col items-center pt-[104px] relative">
                    
                    {/* Headline - Node 5909:33320 */}
                    <div className="text-center px-6 mb-[40px] w-full max-w-[784px]">
                        <h1 className="text-[40px] md:text-[56px] font-semibold leading-[1.24] tracking-[-1.12px] text-[#040b37]">
                            <span className="text-[#1c4ed1]">You dream.</span>
                            <br aria-hidden="true" />
                            We build the brand.
                        </h1>
                    </div>

                    {/* Core Values Section - Node 5914:10147 */}
                    <div className="relative w-full h-[135px]">
                        
                        {/* "Our core values" Pill & Animated Cursor - Node 5914:10140 */}
                        <div className="absolute top-0 left-[3px] z-20 flex flex-col items-start translate-x-4 md:translate-x-12">
                            <div className="bg-[#e3e8f4] border-[3px] border-solid border-white px-[16px] py-[9.5px] rounded-[100px] shadow-sm">
                                <span className="text-[#040b37] text-[16px] font-medium tracking-[-0.16px] text-center">
                                    Our core values
                                </span>
                            </div>
                            
                            {/* Animated Cursor - Node 5914:10143 */}
                            <motion.div 
                                className="absolute left-[32.15px] top-[34.15px] flex items-center justify-center size-[33.936px]"
                                animate={{
                                    y: [0, -6, 0],
                                }}
                                transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            >
                                <div className="">
                                    <Image 
                                        src="/about/cursor-magic-selection-04.svg" 
                                        alt="Magic cursor selection icon"
                                        width={33.936} 
                                        height={33.936} 
                                        className="drop-shadow-sm"
                                    />
                                </div>
                            </motion.div>
                        </div>

                        {/* Dashed Horizontal Line - Node 5914:10125 Start */}
                        <div className="absolute top-[63px] left-0 w-full h-px border-t border-dashed border-[#c8d1e0]" />

                        {/* Values row - Node 5914:10125 (Flex-nowrap to avoid Culture wrapping under) */}
                        <div className="absolute top-[63px] left-0 w-full flex items-start overflow-x-auto scrollbar-hide md:overflow-visible">
                            {values.map((value, index) => (
                                <div key={value} className="flex flex-1 items-start">
                                    <div className="flex-1 flex items-center justify-center py-[25px] px-[24px] min-w-max hover:bg-white/40 transition-colors group cursor-default">
                                        <span className={cn(
                                            "text-[18px] tracking-[-0.18px] leading-[normal] transition-colors whitespace-nowrap",
                                            index === 0 ? "text-[#040b37] font-semibold" : "text-[#4b5563] font-medium",
                                            "group-hover:text-[#1c4ed1]"
                                        )}>
                                            {value}
                                        </span>
                                    </div>
                                    
                                    {/* Vertical Dashed Separators - Node 5914:10128 etc */}
                                    {index < values.length - 1 && (
                                        <div className="h-[72px] w-px border-r border-dashed border-[#c8d1e0] shrink-0 self-center" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 2. "Who we are?" Card Section - Node 5914:10075 (996px wide boundary) */}
                <div className="w-full max-w-[996px] px-4 md:px-0">
                    <div className="bg-white border border-[#c8d1e0] border-solid rounded-[24px] flex flex-col items-center pt-[64px] pb-[40px] px-6 md:px-[40px] gap-[32px] shadow-sm relative overflow-hidden">
                        
                        {/* Text Content - Node 5914:10082 */}
                        <div className="flex flex-col gap-[40px] items-center text-center w-full max-w-[916px]">
                            <h2 className="text-brand-body text-[32px] font-semibold tracking-[-1.28px] leading-[1.24]">
                                Who we are?
                            </h2>
                            
                            <div className="flex flex-col gap-6 font-medium text-brand-body text-[18px] tracking-[-0.18px] leading-[1.6]">
                                <p>
                                    We&apos;ve spent years designing and building digital products, and we&apos;ve seen how unclear direction and rushed decisions can slow teams down. That&apos;s why we created CDS Space, <span className="font-semibold text-[#040b37]">to bring clarity, structure, and consistency to product and brand design.</span>
                                </p>
                                <p>
                                    CDS Space works as an extension of your team. We design and build <span className="font-semibold text-[#040b37]">Web2 and Web3</span> products, brand systems, and digital experiences with a strong focus on usability and long-term growth. Our process is straightforward, collaborative, and shaped around real project needs.
                                </p>
                                <p className="mb-0">
                                    We stay close to modern tools and evolving technologies so our partners can move faster without cutting corners. <span className="font-semibold text-[#040b37]">Every project is approached with care,</span> attention to detail, and clear communication. We believe good work comes from <span className="font-semibold text-[#040b37]">trust and shared ownership.</span> If you have a product to build or a brand to refine, we&apos;re here to work through it with you.
                                </p>
                            </div>
                        </div>

                        {/* CTA Button - Node 5914:10086 */}
                        <motion.a
                            href="/Career"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="bg-[#f4f6fb] border border-[#648efc] border-solid rounded-[100px] p-[2px] shadow-sm inline-block"
                        >
                            <div
                                className="px-[24px] py-[15px] rounded-[100px] flex items-center justify-center transition-all"
                                style={{ backgroundImage: "linear-gradient(146.284deg, rgb(0, 53, 193) 8.8345%, rgb(5, 117, 255) 86.298%)" }}
                            >
                                <span className="text-white text-[18px] font-medium tracking-[-0.18px] leading-[normal]">
                                    Tech Career in CDS Space
                                </span>
                            </div>
                        </motion.a>

                        {/* Team Image - Node 5914:1535 */}
                        <div className="w-full max-w-[916px] h-auto aspect-[916/559] relative rounded-[16px] overflow-hidden grayscale hover:grayscale-0 transition-all duration-700 shadow-lg border border-[#c8d1e0]/30">
                            <Image
                                src="/about/group shot.svg"
                                alt="CDS Team"
                                fill
                                priority
                                quality={95}
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 916px"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
