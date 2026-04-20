"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";

interface BrandLabSuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BrandLabSuccessModal = ({ isOpen, onClose }: BrandLabSuccessModalProps) => {
    useEffect(() => {
        if (isOpen) {
            // High-fidelity celebration effect
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 999 };

            const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

            const interval: any = setInterval(function () {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }

                const particleCount = 50 * (timeLeft / duration);

                // Wide burst from the sides
                confetti({
                    ...defaults,
                    particleCount,
                    origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
                });
                confetti({
                    ...defaults,
                    particleCount,
                    origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
                });
            }, 250);

            // Immediate center burst
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                zIndex: 999
            });

            return () => clearInterval(interval);
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/10 backdrop-blur-sm z-100 cursor-pointer"
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 flex items-center justify-center p-4 z-101 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="bg-white border-4 border-[#e3e8f4] rounded-[24px] max-w-[520px] w-full p-[40px] relative overflow-hidden pointer-events-auto shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] flex flex-col items-center"
                        >
                            {/* Celebrate Ornament */}
                            <div className="absolute top-[24px] left-[50%] -translate-x-1/2 w-[441px] h-[124px] opacity-60 pointer-events-none">
                                <Image
                                    src="/dashboard/subscription/celebrate.svg"
                                    alt="Celebrate"
                                    fill
                                    className="object-contain"
                                />
                            </div>

                            <div className="flex flex-col items-center gap-[40px] relative z-10 text-center w-full">
                                {/* Success Icon Container */}
                                <div className="flex flex-col items-center gap-[24px]">
                                    <div className="w-[64px] h-[64px] relative shrink-0">
                                        <Image
                                            src="/dashboard/subscription/password-validation.svg"
                                            alt="Validation"
                                            width={64}
                                            height={64}
                                        />
                                    </div>

                                    {/* Text Content */}
                                    <div className="flex flex-col gap-[16px] items-center">
                                        <h2 className="text-[#040B37] text-[24px] font-semibold tracking-[-0.96px] leading-[1.24]">
                                            Merch branding request submitted!
                                        </h2>
                                        <p className="text-[#4b5563] text-[16px] font-medium tracking-[-0.16px] leading-relaxed max-w-[340px]">
                                            A design specialist will contact you within 24 hours
                                        </p>
                                    </div>
                                </div>

                                {/* "Got it" Button */}
                                <button
                                    onClick={onClose}
                                    className="bg-[#f4f6fb] border border-[#648efc] rounded-full p-[2px] transition-transform hover:scale-[1.02] active:scale-[0.98] w-fit"
                                >
                                    <div className="bg-linear-to-br from-[#0035C1] to-[#0575FF] px-[32px] py-[15px] rounded-full">
                                        <span className="text-[#f4f6fb] text-[18px] font-medium tracking-[-0.18px]">
                                            Got it
                                        </span>
                                    </div>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};
