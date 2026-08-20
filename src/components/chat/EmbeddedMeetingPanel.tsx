"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Maximize2, Minimize2, Minus, PhoneOff, Video } from "lucide-react";

type EmbeddedMeetingPanelProps = {
  url: string;
  title?: string;
  onClose: () => void;
};

function meetingHref(url: string) {
  const origin = typeof window === "undefined" ? "https://cdsspace.pro" : window.location.origin;
  const parsed = new URL(url, origin);
  parsed.searchParams.set("embed", "1");
  return `${parsed.pathname}${parsed.search}`;
}

export function EmbeddedMeetingPanel({ url, title = "Live cMeet call", onClose }: EmbeddedMeetingPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const closeFallbackRef = useRef<number | null>(null);
  const iframeUrl = useMemo(() => meetingHref(url), [url]);

  const finishClose = useCallback(() => {
    if (closeFallbackRef.current !== null) window.clearTimeout(closeFallbackRef.current);
    closeFallbackRef.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const closeFromMeeting = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "cmeet:close") return;
      finishClose();
    };
    window.addEventListener("message", closeFromMeeting);
    return () => window.removeEventListener("message", closeFromMeeting);
  }, [finishClose]);

  useEffect(() => () => {
    if (closeFallbackRef.current !== null) window.clearTimeout(closeFallbackRef.current);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    if (expanded) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  const requestClose = () => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return finishClose();
    target.postMessage({ type: "cmeet:request-close" }, window.location.origin);
    // The meeting normally acknowledges after it has finalized any local
    // recording. This fallback still lets a user close a frame that failed
    // before the cMeet client mounted.
    closeFallbackRef.current = window.setTimeout(finishClose, 2_000);
  };

  return (
    <section
      aria-label={title}
      className={`fixed z-[120] overflow-hidden border border-[#2a3578] bg-[#0A1130] text-white shadow-[0_30px_100px_rgba(2,6,23,0.55)] transition-all duration-200 ${
        expanded
          ? "inset-0 rounded-none"
          : minimized
            ? "bottom-4 right-4 h-14 w-[min(360px,calc(100vw-2rem))] rounded-2xl"
            : "bottom-4 right-4 h-[min(620px,calc(100dvh-2rem))] w-[min(560px,calc(100vw-2rem))] rounded-2xl"
      }`}
    >
      <header className="flex h-14 items-center gap-3 border-b border-white/10 bg-[#0F1A4A] px-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0A4FE8]">
          <Video className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold">{title}</p>
          <p className="truncate text-[9px] uppercase tracking-[0.16em] text-white/50">cMeet · live in this page</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"
          title="Open meeting link in a new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        {!expanded && (
          <button
            type="button"
            onClick={() => setMinimized((value) => !value)}
            className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"
            title={minimized ? "Restore meeting" : "Minimize meeting"}
          >
            <Minus className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => { setMinimized(false); setExpanded((value) => !value); }}
          className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"
          title={expanded ? "Back to mini view" : "Expand meeting"}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={requestClose}
          className="grid h-9 w-9 place-items-center rounded-xl bg-rose-600 text-white transition hover:bg-rose-700"
          title="Close meeting"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </header>
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        title={title}
        allow="camera; microphone; display-capture; fullscreen; autoplay"
        className={`w-full border-0 bg-[#0A1130] ${minimized && !expanded ? "invisible h-0" : "h-[calc(100%_-_3.5rem)]"}`}
      />
    </section>
  );
}
