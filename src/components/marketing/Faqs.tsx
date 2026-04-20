"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface FAQ {
    id: string;
    question: string;
    answer: string;
    sort_order: number;
}

export const Faqs = () => {
    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [activeIndex, setActiveIndex] = useState<number | null>(0);

    useEffect(() => {
        async function fetchFAQs() {
            const { data } = await supabase
                .from("faqs")
                .select("*")
                .order("sort_order", { ascending: true });
            if (data && data.length > 0) setFaqs(data);
        }
        fetchFAQs();
    }, []);

    if (faqs.length === 0) return null;

    return (
        <section className="py-20 md:py-24 bg-brand-bg relative overflow-hidden" id="faqs">
            <div className="section-container flex flex-col items-center">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-16 md:mb-20"
                >
                    <h2 className="text-[32px] md:text-[40px] lg:text-[48px] font-semibold text-brand-navy leading-[1.24] tracking-[-0.96px]">
                        FAQs, clearly answered
                    </h2>
                </motion.div>

                {/* Accordion */}
                <div className="w-full max-w-[840px] flex flex-col gap-6">
                    {faqs.map((faq, index) => {
                        const isOpen = activeIndex === index;

                        return (
                            <div
                                key={faq.id}
                                className="w-full animate-reveal opacity-0"
                                style={{ animationDelay: `${0.1 + index * 0.1}s` }}
                            >
                                <div className="flex gap-4 md:gap-5 items-start">
                                    <button
                                        onClick={() => setActiveIndex(isOpen ? null : index)}
                                        className={cn(
                                            "shrink-0 w-10 h-10 rounded-full border border-brand-stroke-ii flex items-center justify-center transition-all duration-300",
                                            isOpen ? "bg-[#9ca3af] border-[#9ca3af]" : "bg-[#e3e8f4] hover:bg-white"
                                        )}
                                    >
                                        {isOpen ? (
                                            <Minus className="w-5 h-5 text-white" />
                                        ) : (
                                            <Plus className="w-5 h-5 text-brand-navy" />
                                        )}
                                    </button>

                                    <div className="flex-1 pt-2">
                                        <button
                                            onClick={() => setActiveIndex(isOpen ? null : index)}
                                            className="w-full text-left flex flex-col items-start group"
                                        >
                                            <h3 className={cn(
                                                "text-[18px] font-medium tracking-[-0.18px] transition-colors duration-300",
                                                isOpen ? "text-brand-navy" : "text-brand-navy hover:text-brand-blue"
                                            )}>
                                                {faq.question}
                                            </h3>

                                            <AnimatePresence>
                                                {isOpen && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.4, ease: "circOut" }}
                                                        className="overflow-hidden"
                                                    >
                                                        <p className="pt-4 text-[16px] font-medium text-brand-body leading-normal tracking-[-0.16px] max-w-[691px]">
                                                            {faq.answer}
                                                        </p>
                                                        <motion.div
                                                            initial={{ scaleX: 0 }}
                                                            animate={{ scaleX: 1 }}
                                                            transition={{ duration: 0.6, delay: 0.2 }}
                                                            className="h-px bg-brand-stroke-ii w-full mt-6 origin-left"
                                                        />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
