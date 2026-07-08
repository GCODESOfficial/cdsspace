"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface AuthLayoutProps {
    children: ReactNode;
    /** Optional custom left branding panel. Defaults to the static art. */
    brand?: ReactNode;
}

/**
 * AuthLayout - 1:1 Figma Implementation (Artboard 1728px)
 * Corrected Architecture:
 * - Uses a centered 1728px max-width container.
 * - Enforces the 56px gap exactly.
 * - Fixes the right-side form column to 630px width.
 * - Fixes the left-side branding card to 852px width.
 */
export const AuthLayout = ({ children, brand }: AuthLayoutProps) => {
    return (
        <div className="w-full min-h-screen bg-white flex items-center justify-center font-inter antialiased overflow-hidden">
            {/* Main Surface Container: Matches top/left 24px (p-6) offset from Figma */}
            <main className="w-full max-w-[1728px] h-screen flex p-4 relative">
                {/* Home Button */}
                <Link
                    href="/"
                    className="absolute top-8 right-8 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 text-brand-navy text-sm font-medium hover:bg-gray-50 shadow-sm transition"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Home
                </Link>

                {/* 1:1 Spatial Container */}
                <div className="flex w-full h-full gap-8 lg:gap-10 xl:gap-[40px] 2xl:gap-[56px] items-stretch relative">

                    {/* LEFT SIDE: BRANDING CARD (Node 6279:11893) */}
                    <div className="hidden lg:block w-[45%] lg:max-w-[500px] xl:max-w-[700px] 2xl:max-w-[852px] h-full rounded-[32px] 2xl:rounded-[48px] relative overflow-hidden shrink-0 shadow-[0_24px_48px_rgba(0,0,0,0.1)]">
                        {brand ?? (
                            /* Default branding art (public/auth/Side.svg) */
                            <Image
                                src="/auth/Side.svg"
                                alt="Branding"
                                fill
                                className="object-cover"
                                priority
                            />
                        )}
                    </div>

                    {/* RIGHT SIDE: SCROLLABLE FORM (630px width strictly maintained on large screens) */}
                    <div className="flex-1 w-full lg:max-w-[480px] xl:max-w-[540px] 2xl:max-w-[630px] h-full overflow-y-auto no-scrollbar py-8 lg:py-12 pr-4">
                        {/* Centering Wrapper for the form content */}
                        <div className="w-full min-h-full flex flex-col justify-center">
                            {children}
                        </div>
                    </div>

                </div>
            </main>

            {/* Global Smooth Decoration Overlay (Optional but premium) */}
            <div className="fixed inset-0 pointer-events-none z-50 shadow-[inset_0_0_100px_rgba(0,0,0,0.02)]" />
        </div>
    );
};
