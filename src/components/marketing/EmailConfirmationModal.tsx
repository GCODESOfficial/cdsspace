"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";

interface EmailConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    email?: string;
}

/**
 * EmailConfirmationModal - 1:1 Figma Implementation (Node 6258:19938)
 * Displays a confirmation message after successful registration.
 */
export const EmailConfirmationModal = ({ isOpen, onClose, email }: EmailConfirmationModalProps) => {

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => { document.body.style.overflow = "unset"; };
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
                        className="fixed inset-0 z-[200] bg-[#040B37]/30 backdrop-blur-sm"
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-[201] flex items-end sm:items-center justify-center p-3 sm:p-4 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="w-full max-w-[540px] bg-white border-4 border-[#E3E8F4] rounded-[28px] p-6 sm:p-10 relative overflow-hidden pointer-events-auto max-h-[calc(100dvh-1rem)] overflow-y-auto"
                        >
                            {/* Decorative Confetti Asset (imgCelebrate in Figma) */}
                            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[280px] sm:w-[440px] h-[124px] pointer-events-none opacity-80">
                                <Image
                                    src="/auth/Signup/confetti.svg"
                                    alt="Celebrate"
                                    fill
                                    className="object-contain"
                                />
                            </div>

                            <div className="relative z-10 flex flex-col items-center text-center gap-7 sm:gap-10">

                                {/* Icon Section */}
                                <div className="flex flex-col items-center gap-6">
                                    <div className="relative w-16 h-16 flex items-center justify-center">
                                        {/* Dynamic Icon Approximation: Centerpiece in Figma (Node 6258:19941) */}
                                        <div className="absolute inset-0 bg-[#0575FF]/10 rounded-2xl rotate-12" />
                                        <div className="w-16 h-16 bg-brand-blue rounded-2xl flex items-center justify-center shadow-lg relative z-10">
                                            <CheckCircle2 className="text-white w-8 h-8" />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-4">
                                        <h2 className="text-brand-navy text-[22px] sm:text-[24px] font-semibold tracking-[-0.96px] leading-[1.24]">
                                            Check Your Email
                                        </h2>
                                        <p className="text-brand-body text-[15px] sm:text-[16px] font-medium tracking-[-0.16px] leading-normal max-w-[360px]">
                                            A one-time sign-in link has been sent to your email{email ? `: ${email}` : ''}. Check your inbox and click the link to continue to CDS Space
                                        </p>
                                    </div>
                                </div>

                                {/* Got it Button */}
                                <button
                                    onClick={onClose}
                                    className="w-full h-[56px] rounded-full p-[2px] bg-brand-bg border border-[#648EFC] shadow-[0_4px_8px_rgba(0,0,0,0.04)] group overflow-hidden cursor-pointer"
                                >
                                    <div className="w-full h-full rounded-full flex items-center justify-center transition-opacity group-hover:opacity-90 bg-gradient-to-r from-[#0035C1] to-[#0575FF]"
                                    >
                                        <span className="text-brand-bg text-[18px] font-medium tracking-[-0.18px]">Got it</span>
                                    </div>
                                </button>
                            </div>

                            {/* Optional Close X */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 p-2 text-brand-body/20 hover:text-brand-body transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};
