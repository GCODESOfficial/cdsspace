"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, PhoneIncoming, Video, Volume2 } from "lucide-react";

interface IncomingCall {
  id: string;
  roomCode: string;
  title: string;
  audioOnly: boolean;
  callerName: string;
  startedAt: string;
  link: string;
}

const POLL_INTERVAL_MS = 3_000;

/** Persistent incoming-call UI mounted once by the team dashboard shell. */
export function IncomingCallRinger({ endpoint = "/api/team/calls/incoming" }: { endpoint?: string }) {
  const [calls, setCalls] = useState<IncomingCall[]>([]);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestActive = useRef(false);
  const activeCall = calls[0] || null;

  const stopRingtone = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const startRingtone = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 1;
    audio.loop = true;
    try {
      await audio.play();
      setSoundBlocked(false);
    } catch {
      // Browsers can block sound until the page receives a user gesture. The
      // call card remains visible and offers an explicit way to enable it.
      setSoundBlocked(true);
    }
  }, []);

  const fetchIncomingCalls = useCallback(async () => {
    if (requestActive.current) return;
    requestActive.current = true;
    try {
      const response = await fetch(endpoint, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.ok && Array.isArray(payload.calls)) {
        setCalls(payload.calls);
      }
    } finally {
      requestActive.current = false;
    }
  }, [endpoint]);

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
    void fetchIncomingCalls();
    const timer = window.setInterval(() => void fetchIncomingCalls(), POLL_INTERVAL_MS);
    const refresh = () => void fetchIncomingCalls();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchIncomingCalls]);

  useEffect(() => {
    if (!activeCall) {
      stopRingtone();
      setSoundBlocked(false);
      return;
    }
    stopRingtone();
    void startRingtone();
  }, [activeCall?.id, startRingtone, stopRingtone]);

  // Retry from a real user gesture when autoplay policy blocked the first
  // attempt. This keeps the ringtone automatic after the user's first touch.
  useEffect(() => {
    if (!activeCall || !soundBlocked) return;
    const retry = () => void startRingtone();
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
  }, [activeCall, soundBlocked, startRingtone]);

  if (!activeCall) return null;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-live="assertive"
        aria-label={`Incoming call from ${activeCall.callerName}`}
        className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl"
      >
        <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-blue-50 text-[#0A4FE8]">
          <span className="absolute inset-0 animate-ping rounded-full border border-blue-300/70" aria-hidden="true" />
          {activeCall.audioOnly ? (
            <PhoneIncoming className="relative h-8 w-8" />
          ) : (
            <Video className="relative h-8 w-8" />
          )}
        </div>

        <p className="mt-5 text-xs font-medium text-[#0A4FE8]">
          Incoming {activeCall.audioOnly ? "audio" : "video"} call
        </p>
        <h2 className="mt-1 text-xl font-semibold text-[#0D1B39]">{activeCall.callerName}</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">{activeCall.title}</p>
        {calls.length > 1 && (
          <p className="mt-2 text-xs text-slate-400">{calls.length - 1} more incoming call{calls.length === 2 ? "" : "s"}</p>
        )}

        {soundBlocked && (
          <button
            type="button"
            onClick={() => void startRingtone()}
            className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-semibold text-[#0A4FE8] transition hover:bg-blue-100"
          >
            <Volume2 className="h-4 w-4" />
            Turn on ringtone
          </button>
        )}

        <Link
          href={activeCall.link}
          onClick={stopRingtone}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-semibold text-white transition hover:bg-[#083FC0]"
        >
          <BellRing className="h-4 w-4" />
          Join call
        </Link>
        <p className="mt-3 text-[11px] leading-4 text-slate-400">
          The ringtone stops when you join or when the caller ends the meeting.
        </p>
      </section>
    </div>
  );
}
