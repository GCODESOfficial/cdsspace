"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";

/**
 * Live "Continue / Sign up with Google" button. Navigates to
 * /api/auth/google/login, which kicks off GlashDB's native Google OAuth and
 * returns via /auth/callback. Styled to match LockedSocialButton.
 */
export function GoogleAuthButton({ label, next = "/dashboard" }: { label: string; next?: string }) {
    const [loading, setLoading] = useState(false);
    const href = `/api/auth/google/login?next=${encodeURIComponent(next)}`;

    return (
        <a
            href={href}
            onClick={() => setLoading(true)}
            aria-busy={loading}
            className="relative w-full flex items-center justify-center gap-3 py-3 lg:py-3.5 2xl:py-4 bg-white border border-brand-stroke rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] shadow-[0_4px_8px_rgba(0,0,0,0.04)] overflow-hidden transition hover:bg-brand-bg hover:border-[#648EFC]/50 active:scale-[0.99]"
        >
            {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
            ) : (
                <Image src="/auth/Signup/flat-color-icons_google.svg" alt="Google" width={24} height={24} className="2xl:w-7 2xl:h-7" />
            )}
            <span className="text-brand-navy text-[14px] lg:text-[15px] 2xl:text-[16px] font-semibold">
                {loading ? "Redirecting…" : label}
            </span>
        </a>
    );
}
