"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

/**
 * Social sign-in / sign-up is not live yet. The button is visibly locked and,
 * on hover, focus, or click, swaps its label for an "Available soon" notice
 * instead of starting an OAuth flow.
 */
export function LockedSocialButton({ icon, label }: { icon: React.ReactNode; label: string }) {
    const [show, setShow] = useState(false);
    return (
        <button
            type="button"
            aria-disabled="true"
            title="Available soon"
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            onFocus={() => setShow(true)}
            onBlur={() => setShow(false)}
            onClick={(e) => { e.preventDefault(); setShow(true); }}
            className="relative w-full flex items-center justify-center gap-3 py-3 lg:py-3.5 2xl:py-4 bg-white border border-brand-stroke rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] shadow-[0_4px_8px_rgba(0,0,0,0.04)] overflow-hidden cursor-not-allowed"
        >
            <span className={`flex items-center gap-3 transition-opacity duration-200 ${show ? "opacity-0" : "opacity-100"}`}>
                {icon}
                <span className="text-brand-navy text-[14px] lg:text-[15px] 2xl:text-[16px] font-semibold">{label}</span>
            </span>
            <span className={`absolute inset-0 flex items-center justify-center gap-2 text-brand-mute text-[13px] lg:text-[14px] 2xl:text-[15px] font-semibold transition-opacity duration-200 ${show ? "opacity-100" : "opacity-0"}`}>
                <Lock className="w-4 h-4" />
                Available soon
            </span>
        </button>
    );
}
