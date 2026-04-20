"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface Testimonial {
    id: string;
    name: string;
    review: string;
    picture_url: string | null;
}

const TestimonialCard = ({ testimonial }: { testimonial: Testimonial }) => (
    <div className="bg-[#EAEFF7] p-4 md:p-6 pb-8 rounded-[24px] flex flex-col gap-6 w-full">
        <div className="flex items-center gap-2">
            <div className="relative w-11 h-11 rounded-[16px] overflow-hidden bg-brand-stroke-ii/50 shrink-0">
                {testimonial.picture_url ? (
                    <Image
                        src={testimonial.picture_url}
                        alt={testimonial.name}
                        fill
                        className="object-cover"
                    />
                ) : (
                    <div className="w-full h-full bg-[#C8D1E0] flex items-center justify-center text-white text-lg font-bold">
                        {testimonial.name.charAt(0).toUpperCase()}
                    </div>
                )}
            </div>
            <span className="text-[18px] font-semibold text-brand-navy tracking-tight">
                {testimonial.name}
            </span>
        </div>
        <p className="text-[16px] font-medium text-brand-body leading-relaxed tracking-tight">
            {testimonial.review}
        </p>
    </div>
);

const MarqueeColumn = ({ items, reverse = false, duration = "40s" }: { items: Testimonial[], reverse?: boolean, duration?: string }) => (
    <div className="relative h-[800px] overflow-hidden group">
        <div
            className={cn(
                "flex flex-col gap-5 w-full",
                reverse ? "animate-marquee-vertical-reverse" : "animate-marquee-vertical",
                "group-hover:[animation-play-state:paused]"
            )}
            style={{ animationDuration: duration }}
        >
            {items.map((t, idx) => (
                <TestimonialCard key={`${t.id}-${idx}`} testimonial={t} />
            ))}
        </div>
    </div>
);

export const Testimonials = () => {
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

    useEffect(() => {
        async function fetchTestimonials() {
            const { data } = await supabase
                .from("testimonials")
                .select("id, name, review, picture_url")
                .order("created_at", { ascending: true });
            if (data && data.length > 0) {
                setTestimonials(data);
            }
        }
        fetchTestimonials();
    }, []);

    if (testimonials.length === 0) return null;

    // Duplicate for infinite scroll effect
    const col1 = [...testimonials, ...testimonials];
    const col2 = [...[...testimonials].reverse(), ...[...testimonials].reverse()];
    const col3 = [...testimonials, ...testimonials];

    return (
        <section className="w-full bg-brand-bg relative overflow-hidden flex flex-col items-center" id="testimonials">
            <div className="section-container pt-16 md:pt-24 flex flex-col items-center">
                {/* Header */}
                <div className="text-center max-w-[786px] mb-12 md:mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-[clamp(32px,5vw,48px)] font-semibold text-brand-navy leading-[1.24] tracking-[-0.96px] mb-4"
                    >
                        What our clients say
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-[clamp(16px,2vw,18px)] font-medium text-brand-body tracking-[-0.18px]"
                    >
                        Feedback from teams we&apos;ve designed and built with since 2023.
                    </motion.p>
                </div>

                {/* Marquee */}
                <div className="relative w-full max-w-[1200px] h-[654px] overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        <MarqueeColumn items={col1} duration="50s" />
                        <div className="hidden md:block">
                            <MarqueeColumn items={col2} reverse duration="60s" />
                        </div>
                        <div className="hidden lg:block">
                            <MarqueeColumn items={col3} duration="55s" />
                        </div>
                    </div>

                    {/* Bottom Fade */}
                    <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-brand-bg via-brand-bg/90 to-transparent z-10 pointer-events-none" />
                </div>
            </div>
        </section>
    );
};
