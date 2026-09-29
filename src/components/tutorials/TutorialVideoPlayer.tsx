"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Captions, Maximize2, Minimize2, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Volume2, VolumeX, X } from "lucide-react";

export type TutorialMediaOption = {
  id: string;
  languageCode: string;
  languageName: string;
  videoName: string;
  videoMime: string;
  videoSizeBytes: number;
  hasCaptions: boolean;
  videoUrl: string;
  audioUrl: string | null;
  captionsUrl: string | null;
  isOriginal: boolean;
};

export type TutorialPlayerItem = {
  id: string;
  title: string;
  description: string;
  toolSlug: string;
  /** Every tool, module or page this tutorial is filed under. */
  tags?: string[];
  lastPositionSeconds?: number;
  processingStatus?: "queued" | "processing" | "ready" | "failed";
  sourceLanguageCode?: string;
  media: TutorialMediaOption[];
};

function preferredLanguage() {
  if (typeof window === "undefined") return "en";
  return (localStorage.getItem("cds.lang") || document.documentElement.lang || "en").replace("_", "-");
}

function bestMedia(media: TutorialMediaOption[], language: string) {
  const exact = media.find((item) => item.languageCode.toLowerCase() === language.toLowerCase());
  const base = language.toLowerCase().split("-")[0];
  return exact || media.find((item) => item.languageCode.toLowerCase().split("-")[0] === base)
    || media.find((item) => item.languageCode === "en") || media[0];
}

export function TutorialVideoPlayer({ tutorial, onClose, onProgress }: {
  tutorial: TutorialPlayerItem;
  onClose?: () => void;
  onProgress?: (position: number, completed: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [language, setLanguage] = useState(preferredLanguage);
  const [mediaId, setMediaId] = useState(() => bestMedia(tutorial.media, preferredLanguage())?.id || "");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [captions, setCaptions] = useState(true);
  const [compact, setCompact] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const resumeAt = useRef(Math.max(0, Number(tutorial.lastPositionSeconds || 0)));

  const selected = useMemo(() => tutorial.media.find((item) => item.id === mediaId) || tutorial.media[0], [mediaId, tutorial.media]);
  const translatedAudio = Boolean(selected?.audioUrl);

  useEffect(() => {
    const setFromAccessibility = (event: Event) => {
      const next = String((event as CustomEvent).detail || preferredLanguage());
      setLanguage(next);
      const matching = bestMedia(tutorial.media, next);
      if (matching) setMediaId(matching.id);
    };
    window.addEventListener("cds-set-lang", setFromAccessibility);
    window.addEventListener("cds-lang-detected", setFromAccessibility);
    return () => {
      window.removeEventListener("cds-set-lang", setFromAccessibility);
      window.removeEventListener("cds-lang-detected", setFromAccessibility);
    };
  }, [tutorial.media]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const time = video.currentTime || resumeAt.current;
    const wasPlaying = !video.paused;
    resumeAt.current = time;
    video.load();
    audioRef.current?.load();
    const loaded = () => {
      video.currentTime = Math.min(resumeAt.current, Math.max(0, video.duration - 0.1));
      video.playbackRate = speed;
      if (audioRef.current) {
        audioRef.current.currentTime = Math.min(resumeAt.current, Math.max(0, audioRef.current.duration - 0.1));
        audioRef.current.playbackRate = speed;
      }
      if (wasPlaying) void video.play().catch(() => undefined);
    };
    video.addEventListener("loadedmetadata", loaded, { once: true });
    return () => video.removeEventListener("loadedmetadata", loaded);
  }, [selected?.id]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    video.muted = translatedAudio || muted;
    video.volume = volume;
    if (audio) { audio.muted = muted; audio.volume = volume; audio.playbackRate = speed; }
  }, [translatedAudio, muted, volume, speed, selected?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (const track of Array.from(video.textTracks)) track.mode = captions ? "showing" : "hidden";
  }, [captions, selected?.id]);

  useEffect(() => () => { if (progressTimer.current) clearTimeout(progressTimer.current); }, []);

  const report = useCallback((position: number, completed = false) => {
    if (!onProgress) return;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => onProgress(position, completed), completed ? 0 : 900);
  }, [onProgress]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play(); else video.pause();
  }

  function syncTranslatedAudio(force = false) {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !translatedAudio) return;
    if (force || Math.abs(audio.currentTime - video.currentTime) > 0.35) audio.currentTime = video.currentTime;
  }

  function skip(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
    syncTranslatedAudio(true);
    setCurrentTime(video.currentTime);
    report(video.currentTime);
  }

  async function minimize() {
    const video = videoRef.current as (HTMLVideoElement & { webkitSetPresentationMode?: (mode: string) => void }) | null;
    if (!video) return;
    try {
      if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
        await video.requestPictureInPicture();
        return;
      }
      if (typeof video.webkitSetPresentationMode === "function") {
        video.webkitSetPresentationMode("picture-in-picture");
        return;
      }
    } catch { /* the in-page compact player is the supported fallback */ }
    setCompact(true);
  }

  function screenshot() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const link = document.createElement("a");
    link.download = `${tutorial.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "tutorial"}-${Math.floor(video.currentTime)}s.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function fullscreen() {
    const video = videoRef.current;
    if (video?.requestFullscreen) void video.requestFullscreen();
  }

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const languageFallback = selected && !selected.languageCode.toLowerCase().startsWith(language.toLowerCase().split("-")[0]);

  return (
    <section className={compact ? "fixed bottom-4 right-4 z-[120] w-[min(92vw,430px)] rounded-2xl border border-white/20 bg-[#07133B] p-3 shadow-2xl" : "overflow-hidden rounded-2xl border border-[#DCE5F5] bg-[#07133B] shadow-sm"}>
      <div className="flex items-start justify-between gap-3 px-3 pb-3 pt-1 text-white">
        <div className="min-w-0"><h2 className="truncate text-[14px] font-semibold">{tutorial.title}</h2><p className="mt-0.5 line-clamp-1 text-[11px] text-white/65">{tutorial.description}</p></div>
        <div className="flex shrink-0 items-center gap-1">
          {compact && <button type="button" onClick={() => setCompact(false)} aria-label="Restore tutorial player" className="rounded-lg p-2 hover:bg-white/10"><Maximize2 className="h-4 w-4" /></button>}
          {onClose && <button type="button" onClick={onClose} aria-label="Close tutorial" className="rounded-lg p-2 hover:bg-white/10"><X className="h-4 w-4" /></button>}
        </div>
      </div>
      <div className="relative bg-black">
        {selected ? <video
          ref={videoRef}
          playsInline
          preload="metadata"
          className={`w-full bg-black object-contain ${compact ? "max-h-[240px]" : "aspect-video"}`}
          onPlay={() => { setPlaying(true); if (translatedAudio && audioRef.current) { syncTranslatedAudio(true); void audioRef.current.play().catch(() => undefined); } }}
          onPause={() => { setPlaying(false); audioRef.current?.pause(); }}
          onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration || 0); if (resumeAt.current) event.currentTarget.currentTime = Math.min(resumeAt.current, Math.max(0, event.currentTarget.duration - 0.1)); }}
          onTimeUpdate={(event) => { setCurrentTime(event.currentTarget.currentTime); syncTranslatedAudio(); report(event.currentTarget.currentTime); }}
          onSeeking={() => syncTranslatedAudio(true)}
          onEnded={(event) => { setPlaying(false); audioRef.current?.pause(); report(event.currentTarget.duration || 0, true); }}
        >
          <source src={selected.videoUrl} type={selected.videoMime} />
          {selected.captionsUrl && <track key={selected.captionsUrl} kind="captions" src={selected.captionsUrl} srcLang={selected.languageCode} label={selected.languageName} default />}
        </video> : <div className="grid aspect-video place-items-center text-sm text-white/70">No playable language has been uploaded.</div>}
        {selected?.audioUrl && <audio ref={audioRef} key={selected.audioUrl} preload="metadata" src={selected.audioUrl} />}
        {!playing && <button type="button" onClick={togglePlay} aria-label="Play tutorial" className="absolute inset-0 m-auto grid h-14 w-14 place-items-center rounded-full bg-[#0A4FE8] text-white shadow-lg transition hover:scale-105"><Play className="ml-0.5 h-6 w-6 fill-current" /></button>}
      </div>
      <div className="space-y-3 bg-white p-3">
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="w-9 tabular-nums">{formatTime(currentTime)}</span>
          <input aria-label="Tutorial position" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => { const video = videoRef.current; if (video) { video.currentTime = Number(event.target.value); syncTranslatedAudio(true); } }} className="min-w-0 flex-1 accent-[#0A4FE8]" />
          <span className="w-9 text-right tabular-nums">{formatTime(duration)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[#344054]">
          <button type="button" onClick={() => skip(-10)} title="Back 10 seconds" className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" onClick={togglePlay} title={playing ? "Pause" : "Play"} className="rounded-lg bg-[#0A4FE8] p-2 text-white hover:bg-[#083EC0]">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
          <button type="button" onClick={() => skip(10)} title="Forward 10 seconds" className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><RotateCw className="h-4 w-4" /></button>
          <button type="button" onClick={() => setMuted((value) => !value)} title={muted ? "Unmute" : "Mute"} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
          <input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); setMuted(next === 0); }} className="w-20 accent-[#0A4FE8]" />
          <button type="button" onClick={() => setCaptions((value) => !value)} disabled={!selected?.hasCaptions} title="Captions" className={`rounded-lg border p-2 disabled:opacity-35 ${captions && selected?.hasCaptions ? "border-blue-200 bg-blue-50 text-[#0A4FE8]" : "border-gray-200 hover:bg-gray-50"}`}><Captions className="h-4 w-4" /></button>
          <select aria-label="Playback speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-semibold">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
          <select aria-label="Audio language" value={selected?.id || ""} onChange={(event) => setMediaId(event.target.value)} className="h-9 min-w-[118px] rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-semibold">
            {tutorial.media.map((item) => <option key={item.id} value={item.id}>{item.languageName} audio</option>)}
          </select>
          <span className="ml-auto flex items-center gap-1">
            <button type="button" onClick={screenshot} title="Save screenshot" className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><Camera className="h-4 w-4" /></button>
            <button type="button" onClick={minimize} title="Minimize player" className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">{compact ? <Minimize2 className="h-4 w-4" /> : <PictureInPicture2 className="h-4 w-4" />}</button>
            <button type="button" onClick={fullscreen} title="Full screen" className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><Maximize2 className="h-4 w-4" /></button>
          </span>
        </div>
        {languageFallback && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10.5px] text-amber-800">Audio in your selected accessibility language is not available yet. {selected?.languageName} is playing as the fallback.</p>}
        {translatedAudio && <p className="rounded-lg bg-blue-50 px-3 py-2 text-[10.5px] text-blue-800">The selected narration is an AI-generated translation. Captions follow the same language.</p>}
      </div>
    </section>
  );
}
