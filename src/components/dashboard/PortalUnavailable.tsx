"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Shown when the dashboard cannot reach the database for a moment.
 *
 * Previously this case either signed the client out or produced a bare 500
 * page. Their session is still valid, so the page simply waits and retries on
 * their behalf, and returns to the dashboard the moment the read succeeds.
 */
export function PortalUnavailable() {
  const router = useRouter();

  useEffect(() => {
    const retry = window.setInterval(() => router.refresh(), 4_000);
    const onVisible = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(retry);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0F5FF] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#E4EAF5] bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-[#0D1B39]">Dashboard temporarily unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Your session is still active and we are reconnecting automatically.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-5 min-h-11 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white transition hover:bg-[#083FC0]"
        >
          Try now
        </button>
      </div>
    </div>
  );
}
