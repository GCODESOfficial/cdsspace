"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Live "Continue / Sign up with LinkedIn" button. Navigates to
 * /api/auth/linkedin/login, which kicks off GlashDB's native LinkedIn (OIDC)
 * OAuth and returns via /auth/callback. Styled to match GoogleAuthButton.
 */
export function LinkedInAuthButton({ label, next = "/dashboard" }: { label: string; next?: string }) {
  const [loading, setLoading] = useState(false);
  const canonicalOrigin = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const href = `${canonicalOrigin}/api/auth/linkedin/login?next=${encodeURIComponent(next)}`;

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
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="2xl:w-7 2xl:h-7" aria-hidden="true">
          <rect width="24" height="24" rx="4" fill="#0A66C2" />
          <path fill="#fff" d="M6.94 8.58H4.5V19h2.44V8.58zM5.72 7.44a1.42 1.42 0 1 0 0-2.84 1.42 1.42 0 0 0 0 2.84zM19.5 19h-2.44v-5.09c0-1.28-.46-2.15-1.6-2.15-.87 0-1.39.59-1.62 1.16-.08.2-.1.49-.1.77V19h-2.44s.03-9.19 0-10.42h2.44v1.48c.32-.5.9-1.21 2.2-1.21 1.6 0 2.8 1.05 2.8 3.3V19z" />
        </svg>
      )}
      <span className="text-brand-navy text-[14px] lg:text-[15px] 2xl:text-[16px] font-semibold">
        {loading ? "Redirecting…" : label}
      </span>
    </a>
  );
}
