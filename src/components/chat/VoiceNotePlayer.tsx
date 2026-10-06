"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";

/**
 * Voice notes in the web chats. The mobile app records them as .m4a files and
 * posts them with a "🎤 Voice note (0:12)" caption; here they play in place with
 * the same controls as the app (play/pause, a seekable progress bar, the time).
 * Only one voice note plays at a time.
 */

const AUDIO_EXTENSION = /\.(m4a|aac|mp3|wav|ogg|opus|oga)(\?|#|$)/i;

export function isVoiceNote(url?: string | null, mimeType?: string | null) {
  if (!url) return false;
  return /^audio\//i.test(mimeType || "") || AUDIO_EXTENSION.test(url);
}

/** A voice note's caption is replaced by the player, like "📎 name" by the file card. */
export function isVoiceNoteCaption(text?: string | null) {
  return /^🎤/.test((text || "").trim());
}

// "🎤 Voice note (0:12)" → 12, so the length shows before the audio loads.
function captionSeconds(text?: string | null) {
  const match = /\((\d+):(\d{2})\)/.exec(text || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

let current: HTMLAudioElement | null = null;

export function VoiceNotePlayer({ url, caption, mine = false }: { url: string; caption?: string | null; mine?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(captionSeconds(caption));

  useEffect(() => {
    const el = audio.current;
    return () => {
      if (current === el) current = null;
    };
  }, []);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    if (current && current !== el) current.pause();
    current = el;
    void el.play().catch(() => setPlaying(false));
  };

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = audio.current;
    if (!el || !duration) return;
    const box = event.currentTarget.getBoundingClientRect();
    el.currentTime = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * duration;
  };

  const progress = duration ? Math.min(1, time / duration) : 0;
  const ink = mine ? "bg-white" : "bg-[#0A4FE8]";

  return (
    <div className="mt-2 flex w-[240px] max-w-full items-center gap-3">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
          if (audio.current) audio.current.currentTime = 0;
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) setDuration(e.currentTarget.duration);
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${mine ? "bg-white/20 text-white" : "bg-blue-50 text-[#0A4FE8]"}`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div role="slider" aria-label="Voice note position" aria-valuenow={Math.round(time)} aria-valuemax={Math.round(duration)} onClick={seek} className="relative h-4 cursor-pointer">
          <div className={`absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full ${mine ? "bg-white/35" : "bg-slate-200"}`} />
          <div className={`absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full ${ink}`} style={{ width: `${progress * 100}%` }} />
          <div className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${ink}`} style={{ left: `${progress * 100}%` }} />
        </div>
        <div className={`mt-1 flex items-center gap-1 text-[10px] ${mine ? "text-white/80" : "text-slate-400"}`}>
          <Mic className="h-3 w-3" />
          {playing || time > 0 ? clock(time) : clock(duration)}
        </div>
      </div>
    </div>
  );
}
