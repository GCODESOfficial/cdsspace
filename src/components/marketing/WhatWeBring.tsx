import { SectionHeader } from "@/components/shared/SectionHeader";
import { cn } from "@/lib/utils";
import Image from "next/image";

const items = [
    {
        title: "Easy Design",
        description: "A simple, clear process that gives you control over your brand’s look and feel.",
        gif: "/gifs/0b6be0b3281f66ba1728cee014029b89b4b7854f.gif",
    },
    {
        title: "Fast Delivery",
        description: "Quick turnarounds so your projects stay on schedule without sacrificing quality.",
        gif: "/gifs/0ef41b40b9a0af6d6a6728931e72d903877a64fe.gif",
    },
    {
        title: "Top Quality",
        description: "Expert-level work that ensures your brand stands out and feels professional.",
        gif: "/gifs/1c5553da7c6a175b5bf5c53cb8d2f61d5048b998.gif",
    },
    {
        title: "Flexible Plans",
        description: "Options that adapt to your needs, whether it’s a small project or a full-scale brand effort.",
        gif: "/gifs/38b41c8b35d018814a54f30be36c977696208f86.gif",
    },
    {
        title: "Custom Work",
        description: "Unique designs created specifically for your vision, your audience, and your goals.",
        gif: "/gifs/e42d51990997e67a4170135dbfac95a448e701df.gif",
    }
];

export const WhatWeBring = () => {
    return (
        <section className="bg-brand-bg/50 overflow-hidden" id="expertise">
            <div className="section-container">
                <SectionHeader
                    badge="Our Edge"
                    title="What we bring to the table"
                    description="Behind every great brand we build, is a clear process grounded in research, design, and care."
                />

                <div className="relative mt-16">
                    {/* Grid for Top 3 Items */}
                    <div className="grid grid-cols-1 md:grid-cols-3 relative">
                        {items.slice(0, 3).map((item, idx) => (
                            <div
                                key={item.title}
                                className={cn(
                                    "flex flex-col items-center text-center p-8 md:p-12 animate-reveal opacity-0 relative group",
                                    idx < 2 && "md:after:content-[''] md:after:absolute md:after:right-0 md:after:top-1/2 md:after:-translate-y-1/2 md:after:h-40 md:after:w-px md:after:bg-brand-stroke"
                                )}
                                style={{ animationDelay: `${0.2 + idx * 0.1}s` }}
                            >
                                <div className="w-16 h-16 rounded-xl bg-brand-stroke border-[4px] border-white flex items-center justify-center mb-8 shadow-sm group-hover:scale-110 transition-transform duration-300 overflow-hidden relative p-3.5">
                                    <Image
                                        src={item.gif}
                                        alt={item.title}
                                        fill
                                        className="object-contain p-3"
                                        unoptimized
                                    />
                                </div>
                                <h3 className="text-xl font-bold text-brand-navy mb-3 tracking-tight">{item.title}</h3>
                                <p className="text-brand-body leading-relaxed max-w-[280px]">
                                    {item.description}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Horizontal Divider Line */}
                    <div className="hidden md:block w-full h-px bg-brand-stroke my-8 animate-reveal opacity-0" style={{ animationDelay: '0.5s' }} />

                    {/* Grid for Bottom 2 Items */}
                    <div className="grid grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto relative mt-8 md:mt-0">
                        {items.slice(3).map((item, idx) => (
                            <div
                                key={item.title}
                                className={cn(
                                    "flex flex-col items-center text-center p-8 md:p-12 animate-reveal opacity-0 relative group",
                                    idx === 0 && "md:after:content-[''] md:after:absolute md:after:right-0 md:after:top-1/2 md:after:-translate-y-1/2 md:after:h-40 md:after:w-px md:after:bg-brand-stroke"
                                )}
                                style={{ animationDelay: `${0.6 + idx * 0.1}s` }}
                            >
                                <div className="w-16 h-16 rounded-xl bg-brand-stroke border-[4px] border-white flex items-center justify-center mb-8 shadow-sm group-hover:scale-110 transition-transform duration-300 overflow-hidden relative p-3.5">
                                    <Image
                                        src={item.gif}
                                        alt={item.title}
                                        fill
                                        className="object-contain p-3"
                                        unoptimized
                                    />
                                </div>
                                <h3 className="text-xl font-bold text-brand-navy mb-3 tracking-tight">{item.title}</h3>
                                <p className="text-brand-body leading-relaxed max-w-[280px]">
                                    {item.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
