"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

interface EmailConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    email?: string;
    initialResendSeconds?: number;
    onResend?: () => Promise<{ error?: string; message?: string; resendInSeconds?: number }>;
    /** Checks the six-digit code. When given, the modal asks for the code instead of just saying "check your email". */
    onVerify?: (code: string) => Promise<{ error?: string; success?: boolean }>;
}

/**
 * EmailConfirmationModal - 1:1 Figma Implementation (Node 6258:19938)
 * Displays a confirmation message after successful registration.
 */
export const EmailConfirmationModal = ({
    isOpen,
    onClose,
    email,
    initialResendSeconds = 60,
    onResend,
    onVerify,
}: EmailConfirmationModalProps) => {
    const [resendIn, setResendIn] = useState(initialResendSeconds);
    const [resending, setResending] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [codeError, setCodeError] = useState<string | null>(null);

    async function verify(value = code) {
        if (!onVerify || verifying || !/^\d{6}$/.test(value)) return;
        setVerifying(true);
        setCodeError(null);
        const result = await onVerify(value).catch(() => ({ error: "We could not check the code. Please try again." }));
        if (result.error) {
            setCodeError(result.error);
            setCode("");
            setVerifying(false);
        }
        // On success the page navigates away; the spinner stays until it does.
    }

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => { document.body.style.overflow = "unset"; };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        setResendIn(initialResendSeconds);
        setNotice(null);
        setCode("");
        setCodeError(null);
    }, [initialResendSeconds, isOpen]);

    useEffect(() => {
        if (!isOpen || resendIn <= 0) return;
        const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1_000);
        return () => window.clearInterval(timer);
    }, [isOpen, resendIn]);

    async function resend() {
        if (!onResend || resending || resendIn > 0) return;
        setResending(true);
        setNotice(null);
        const result: { error?: string; message?: string; resendInSeconds?: number } = await onResend()
            .catch(() => ({ error: "The verification email could not be resent." }));
        setResending(false);
        if (result.error) {
            setNotice(result.error);
            return;
        }
        setNotice(result.message || "A new code has been sent.");
        setCodeError(null);
        setResendIn(result.resendInSeconds || initialResendSeconds);
    }

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
                                            {onVerify
                                                ? <>We sent a six-digit code to {email ? <span className="text-brand-navy">{email}</span> : "your email"}. Enter it below to confirm the address and activate your account.</>
                                                : <>A one-time verification link has been sent to your email{email ? `: ${email}` : ''}. Your client account will be activated only after you open it.</>}
                                        </p>
                                        {onVerify && (
                                            <form
                                                onSubmit={(event) => { event.preventDefault(); void verify(); }}
                                                className="flex flex-col items-center gap-2"
                                            >
                                                <input
                                                    value={code}
                                                    onChange={(event) => {
                                                        const next = event.target.value.replace(/\D/g, "").slice(0, 6);
                                                        setCode(next);
                                                        setCodeError(null);
                                                        if (next.length === 6) void verify(next);
                                                    }}
                                                    inputMode="numeric"
                                                    autoComplete="one-time-code"
                                                    autoFocus
                                                    disabled={verifying}
                                                    placeholder="000000"
                                                    aria-label="Six-digit verification code"
                                                    aria-invalid={Boolean(codeError)}
                                                    className={`w-full max-w-[260px] rounded-2xl border bg-brand-bg px-4 py-3 text-center font-mono text-[26px] font-semibold tracking-[0.4em] text-brand-navy outline-none placeholder:text-brand-mute/50 focus:border-[#0A4FE8] disabled:opacity-60 ${codeError ? "border-red-400" : "border-brand-stroke"}`}
                                                />
                                                {codeError && <p role="alert" className="text-[13px] font-medium text-red-600">{codeError}</p>}
                                            </form>
                                        )}
                                        {notice && <p className="text-[13px] font-medium text-brand-body">{notice}</p>}
                                        {onResend && (
                                            <button
                                                type="button"
                                                onClick={resend}
                                                disabled={resending || resendIn > 0}
                                                className="text-[13px] font-semibold text-[#0A4FE8] hover:underline disabled:cursor-wait disabled:text-brand-mute disabled:no-underline"
                                            >
                                                {resending ? "Sending…" : resendIn > 0 ? `Resend available in ${resendIn}s` : onVerify ? "Send a new code" : "Resend verification email"}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Got it Button */}
                                <button
                                    onClick={onVerify ? () => void verify() : onClose}
                                    disabled={Boolean(onVerify) && (verifying || code.length !== 6)}
                                    className="w-full h-[56px] rounded-full p-[2px] bg-brand-bg border border-[#648EFC] shadow-[0_4px_8px_rgba(0,0,0,0.04)] group overflow-hidden cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <div className="w-full h-full rounded-full flex items-center justify-center transition-opacity group-hover:opacity-90 bg-[#0A4FE8]"
                                    >
                                        <span className="text-brand-bg text-[18px] font-medium tracking-[-0.18px]">
                                            {onVerify ? (verifying ? "Verifying…" : "Verify and continue") : "Got it"}
                                        </span>
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
