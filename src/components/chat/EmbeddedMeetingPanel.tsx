"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, PhoneOff, Video } from "lucide-react";
import { buildCMeetAutoJoinPath } from "@/lib/cmeet-links";

type EmbeddedMeetingPanelProps = {
  url: string;
  title?: string;
  onClose: () => void;
};

/**
 * GlashDB enforces X-Frame-Options: DENY on application documents, so cMeet
 * cannot safely run in an iframe. Keep this small transition surface for the
 * existing chat call sites, then move through the Next router into the room.
 */
export function EmbeddedMeetingPanel({ url, title = "Live cMeet call", onClose }: EmbeddedMeetingPanelProps) {
  const router = useRouter();
  const destination = useMemo(() => buildCMeetAutoJoinPath(url), [url]);

  useEffect(() => {
    const timer = window.setTimeout(() => router.push(destination), 80);
    return () => window.clearTimeout(timer);
  }, [destination, router]);

  return (
    <section aria-label={`Opening ${title}`} className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center text-[#0D1B39] shadow-2xl">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#0A4FE8] text-white">
          <Video className="h-5 w-5" />
        </span>
        <h2 className="mt-4 truncate text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">Opening the secure cMeet room and connecting your call.</p>
        <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-[#0A4FE8]" />
        <Link href={destination} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0A4FE8] text-sm font-semibold text-white">
          Continue to cMeet
        </Link>
        <button type="button" onClick={onClose} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-50">
          <PhoneOff className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </section>
  );
}
