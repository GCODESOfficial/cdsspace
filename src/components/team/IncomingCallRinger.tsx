"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CalendarClock, Loader2, PhoneForwarded, PhoneIncoming, Video, Volume2 } from "lucide-react";

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
/** How long a call rings before it is treated as unanswered. */
const DEFAULT_RING_SECONDS = 180;

type Colleague = { id: string; full_name: string; role_title: string | null; department: string | null };

/** Persistent incoming-call UI mounted once by the team dashboard shell. */
export function IncomingCallRinger({ endpoint = "/api/team/calls/incoming" }: { endpoint?: string }) {
  const [calls, setCalls] = useState<IncomingCall[]>([]);
  const [soundBlocked, setSoundBlocked] = useState(false);
  // An admin who cannot take the call needs somewhere for it to go: a
  // colleague, or a time the client can count on.
  const [panel, setPanel] = useState<"none" | "redirect" | "reschedule">("none");
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [targetMemberId, setTargetMemberId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ringSeconds, setRingSeconds] = useState(DEFAULT_RING_SECONDS);
  const [elapsed, setElapsed] = useState(0);
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
        if (Number(payload.ringSeconds) > 0) setRingSeconds(Number(payload.ringSeconds));
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
    setPanel("none");
    setActionError(null);
    setNote("");
    setTargetMemberId("");
    stopRingtone();
    void startRingtone();
  }, [activeCall?.id, startRingtone, stopRingtone]);

  // How long this call has been ringing, so the card can count down and stop.
  useEffect(() => {
    if (!activeCall) { setElapsed(0); return; }
    const since = new Date(activeCall.startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - since) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [activeCall?.id, activeCall?.startedAt]);

  const act = useCallback(async (body: Record<string, unknown>) => {
    if (!activeCall) return false;
    setWorking(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/admin/calls/${activeCall.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "That call could not be updated.");
      stopRingtone();
      // It is no longer this admin's call, so clear it and let the next poll
      // bring anything else that is waiting.
      setCalls((current) => current.filter((call) => call.id !== activeCall.id));
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That call could not be updated.");
      return false;
    } finally {
      setWorking(false);
    }
  }, [activeCall, stopRingtone]);

  // Nobody answered. The ringtone stops and the client is told, rather than
  // being left listening to a tone with no idea whether anyone is coming.
  useEffect(() => {
    if (!activeCall || elapsed < ringSeconds) return;
    stopRingtone();
    void act({ action: "unavailable" });
  }, [activeCall, elapsed, ringSeconds, act, stopRingtone]);

  // The colleague list is only needed once an admin decides to pass the call on.
  useEffect(() => {
    if (panel !== "redirect" || colleagues.length) return;
    if (!activeCall) return;
    void fetch(`/api/admin/calls/${activeCall.id}/action`, { credentials: "include" })
      .then((response) => response.json())
      .then((payload) => { if (Array.isArray(payload?.colleagues)) setColleagues(payload.colleagues); })
      .catch(() => undefined);
  }, [panel, colleagues.length, activeCall]);

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

        {/* An admin who cannot take it can still resolve it for the client. */}
        {panel === "none" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { stopRingtone(); setPanel("redirect"); }}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <PhoneForwarded className="h-3.5 w-3.5" />
              Redirect
            </button>
            <button
              type="button"
              onClick={() => { stopRingtone(); setPanel("reschedule"); }}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Reschedule
            </button>
          </div>
        )}

        {panel === "redirect" && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left">
            <label className="text-[11px] font-semibold text-slate-600" htmlFor="call-redirect-target">Pass this call to</label>
            <select
              id="call-redirect-target"
              value={targetMemberId}
              onChange={(event) => setTargetMemberId(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#0A4FE8]"
            >
              <option value="">Choose a colleague…</option>
              {colleagues.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}{person.role_title ? ` · ${person.role_title}` : ""}
                </option>
              ))}
            </select>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What should they know? (optional)"
              className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#0A4FE8]"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={!targetMemberId || working}
                onClick={() => void act({ action: "redirect", targetMemberId, note })}
                className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneForwarded className="h-3.5 w-3.5" />}
                Send it over
              </button>
              <button type="button" onClick={() => setPanel("none")} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600">
                Back
              </button>
            </div>
          </div>
        )}

        {panel === "reschedule" && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left">
            <label className="text-[11px] font-semibold text-slate-600" htmlFor="call-reschedule-at">Offer another time</label>
            <input
              id="call-reschedule-at"
              type="datetime-local"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#0A4FE8]"
            />
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="A word for the client (optional)"
              className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#0A4FE8]"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={!scheduledFor || working}
                onClick={() => void act({ action: "reschedule", scheduledFor: new Date(scheduledFor).toISOString(), note })}
                className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
                Tell the client
              </button>
              <button type="button" onClick={() => setPanel("none")} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600">
                Back
              </button>
            </div>
          </div>
        )}

        {actionError && <p className="mt-2 text-[11px] font-medium text-rose-600">{actionError}</p>}

        <p className="mt-3 text-[11px] leading-4 text-slate-400">
          {elapsed < ringSeconds
            ? `Ringing for ${Math.max(0, ringSeconds - elapsed)}s more. It stops when you join, redirect it, or offer another time.`
            : "This call rang out. The client has been told the support team is unavailable."}
        </p>
      </section>
    </div>
  );
}
