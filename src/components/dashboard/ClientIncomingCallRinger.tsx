"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { declineIncomingCall, IncomingCallCard, type IncomingCallView } from "@/components/cmeet/IncomingCallCard";

/**
 * Incoming calls on the client dashboard (GET /api/client/calls/incoming every
 * 3 s): rings until the client accepts, declines (the caller sees "Call
 * declined"), or the caller ends the call.
 */
export function ClientIncomingCallRinger() {
  const pathname = usePathname();
  const [calls, setCalls] = useState<IncomingCallView[]>([]);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [declining, setDeclining] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadingRef = useRef(false);
  const declinedRef = useRef<string[]>([]);
  const active = calls[0] || null;

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const ring = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 1;
    audio.loop = true;
    try {
      await audio.play();
      setSoundBlocked(false);
    } catch {
      setSoundBlocked(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const response = await fetch(`/api/client/calls/incoming?path=${encodeURIComponent(pathname || "/dashboard")}`, { cache: "no-store", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) setCalls((payload.calls || []).filter((call: IncomingCallView) => !declinedRef.current.includes(call.id)));
    } finally {
      loadingRef.current = false;
    }
  }, [pathname]);

  useEffect(() => {
    const audio = new Audio("/special-notification.mp3");
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = 1;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!active) {
      stop();
      setSoundBlocked(false);
      return;
    }
    stop();
    void ring();
  }, [active?.id, ring, stop]);

  useEffect(() => {
    if (!active || !soundBlocked) return;
    const retry = () => void ring();
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
  }, [active, soundBlocked, ring]);

  if (!active) return null;

  const decline = async () => {
    setDeclining(true);
    stop();
    declinedRef.current = [...declinedRef.current, active.id];
    setCalls((current) => current.filter((call) => call.id !== active.id));
    await declineIncomingCall(active.roomCode);
    setDeclining(false);
  };

  return (
    <IncomingCallCard call={active} more={calls.length - 1} declining={declining} onDecline={() => void decline()} onAccept={stop}>
      {soundBlocked && (
        <button
          type="button"
          onClick={() => void ring()}
          className="mx-auto flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-semibold text-[#C9D4F5] transition hover:bg-white/10"
        >
          <Volume2 className="h-4 w-4" />
          Turn on ringtone
        </button>
      )}
    </IncomingCallCard>
  );
}
