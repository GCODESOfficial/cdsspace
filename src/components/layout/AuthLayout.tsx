"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { usePathname } from "next/navigation";

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
    const pathname = usePathname();
    const showMobileBrandPanel = pathname === "/login";

    return (
        <div data-app-shell="auth" className="flex min-h-[100dvh] w-full items-center justify-center overflow-x-clip bg-white font-inter antialiased lg:h-screen lg:overflow-hidden">
            {/* Main Surface Container: Matches top/left 24px (p-6) offset from Figma */}
            <main data-app-content className="relative flex min-h-[100dvh] w-full max-w-[1728px] px-3 pt-3 pb-0 sm:px-4 sm:pt-4 sm:pb-0 lg:h-screen lg:min-h-0 lg:p-4">
                {/* Compact back card. !w-auto protects it from the shared direct-child width rule. */}
                <Link
                    href="/"
                    aria-label="Back to home"
                    title="Back to home"
                    className="absolute right-4 top-4 z-50 flex h-11 !w-auto items-center justify-center gap-1.5 rounded-[12px] border border-brand-stroke bg-white px-4 text-[16px] font-medium text-brand-body shadow-[0_8px_20px_rgba(4,11,55,0.10)] transition hover:border-brand-stroke-ii hover:bg-brand-bg hover:text-brand-navy sm:right-6 sm:top-6 lg:right-10 2xl:right-14"
                >
                    <ArrowLeft className="h-5 w-5 text-brand-navy" aria-hidden="true" />
                    <span>back</span>
                </Link>

                {/* 1:1 Spatial Container */}
                <div className="relative flex h-full w-full flex-col items-stretch gap-8 lg:flex-row lg:gap-10 xl:gap-[40px] 2xl:gap-[56px]">

                    {/* Branding card: after login options on mobile, beside them on desktop. */}
                    <div className={`${showMobileBrandPanel ? "block" : "hidden"} relative order-2 min-h-[100dvh] w-full shrink-0 overflow-hidden rounded-t-[32px] bg-brand-blue shadow-[0_24px_48px_rgba(0,0,0,0.1)] lg:order-1 lg:block lg:h-full lg:min-h-0 lg:w-[45%] lg:max-w-[500px] lg:rounded-[32px] xl:max-w-[700px] 2xl:max-w-[852px] 2xl:rounded-[48px]`}>
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
                    <div className="order-1 min-h-full w-full flex-1 overflow-visible py-16 pr-0 sm:py-20 lg:order-2 lg:h-full lg:max-w-[480px] lg:overflow-y-auto lg:py-12 lg:pr-4 xl:max-w-[540px] 2xl:max-w-[630px]">
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
