"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";

interface SuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SuccessModal = ({ isOpen, onClose }: SuccessModalProps) => {
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
                        className="fixed inset-0 bg-black/10 backdrop-blur-sm z-[100] cursor-pointer"
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-4 z-[101] pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="bg-white border-4 border-[#e3e8f4] rounded-[28px] max-w-[520px] w-full p-6 sm:p-[32px] lg:p-[40px] relative overflow-hidden pointer-events-auto shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] max-h-[calc(100dvh-1rem)] overflow-y-auto"
                        >
                            <div className="flex flex-col items-center gap-6 sm:gap-[32px] lg:gap-[40px] relative z-10 text-center">
                                {/* Success Icon */}
                                <div className="w-[64px] h-[64px] relative shrink-0">
                                    <Image
                                        src="/dashboard/subscription/password-validation.svg"
                                        alt="Success"
                                        width={64}
                                        height={64}
                                    />
                                </div>

                                {/* Text Content */}
                                <div className="flex flex-col gap-[16px] items-center">
                                    <h2 className="text-[#040B37] text-[22px] sm:text-[24px] font-semibold tracking-[-0.96px] leading-[1.24]">
                                        Subscription request submitted!
                                    </h2>
                                    <p className="text-[#4B5563] text-[15px] sm:text-[16px] font-medium tracking-[-0.16px]">
                                        A design specialist will contact you within 24 hours
                                    </p>
                                </div>

                                {/* "Got it" Button */}
                                <button
                                    onClick={onClose}
                                    className="group relative cursor-pointer"
                                >
                                    <div className="absolute inset-[-2px] border border-[#648efc] rounded-full p-[2px]" />
                                    <div className="bg-linear-to-br from-[#0035C1] to-[#0575FF] px-8 lg:px-[48px] py-[15px] rounded-full transition-all group-hover:scale-[1.02] group-active:scale-[0.98]">
                                        <span className="text-white text-[18px] font-medium tracking-[-0.18px]">
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
