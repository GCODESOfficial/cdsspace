"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, ScreenShare, ScreenShareOff,
  MessageCircle, Send, Smile, X as XIcon, Loader2, Check,
  AtSign, Search, CircleStop, AlertTriangle, Users, Circle,
} from "lucide-react";
import {
  requestAdmission, pollAdmission, fetchWaitingGuests, decideAdmission,
  type WaitingGuest,
} from "@/lib/cmeet-admission";
import { CMeetClient, type RemotePeer, type ChatMessage, type ConnectionQuality } from "@/lib/cmeet-rtc";
import { appAlert } from "@/lib/app-notify";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";

/* ------------------------------------------------------------------ */
/*  Emoji hinting                                                     */
/* ------------------------------------------------------------------ */
const EMOJI_HINTS: Record<string, string[]> = {
  thanks: ["🙏", "💚", "🙌"],
  great: ["🔥", "🚀", "👏"],
  ship: ["🚢", "🚀"],
  lol: ["😂", "🤣"],
  love: ["❤️", "😍"],
  help: ["🆘", "🙋"],
  yes: ["✅", "👍"],
  no: ["❌", "👎"],
};
function hintEmojis(text: string): string[] {
  const lower = text.toLowerCase();
  const out = new Set<string>();
  for (const [kw, em] of Object.entries(EMOJI_HINTS)) {
    if (lower.includes(kw)) em.forEach((e) => out.add(e));
  }
  return Array.from(out);
}

interface Meeting {
  title: string;
  created_by: string | null;
  created_by_admin: boolean;
  started_at?: string | null;
  ended_at?: string | null;
  scheduled_for?: string | null;
  audio_only: boolean;
}

/* ------------------------------------------------------------------ */
/*  Live video tile - subscribes to a MediaStream and paints it.     */
/*  Keyed by stream.id so React re-mounts on stream swap.            */
/* ------------------------------------------------------------------ */
function VideoTile({
  stream,
  muted = false,
  objectFit = "cover",
  className = "",
}: {
  stream: MediaStream | null;
  muted?: boolean;
  objectFit?: "cover" | "contain";
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      // Re-bind whenever tracks change inside the stream so the swap
      // (cam ↔ screen share) repaints immediately.
      const reapply = () => { if (el.srcObject !== stream) el.srcObject = stream; };
      stream.addEventListener("addtrack", reapply);
      stream.addEventListener("removetrack", reapply);
      // Autoplay can be blocked on Safari/iOS until user interaction - retry once muted.
      const play = () => el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
      play();
      return () => {
        stream.removeEventListener("addtrack", reapply);
        stream.removeEventListener("removetrack", reapply);
      };
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      // Hint the compositor to keep the video on its own layer - stops the
      // whole grid repainting every frame when several tiles are live.
      style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
      className={`w-full h-full bg-black ${objectFit === "contain" ? "object-contain" : "object-cover"} ${className}`}
    />
  );
}

/**
 * Remote audio is played from its own <audio> element, never from a video
 * tile. Video tiles get mounted, unmounted and re-keyed as the layout changes
 * (grid <-> presenter, participant strip), and every one of those churns used
 * to cut or double a peer's audio. These elements are mounted once per peer
 * for the whole call and are never re-keyed, so the sound stays continuous.
 */
function RemoteAudio({ peers }: { peers: RemotePeer[] }) {
  return (
    <div aria-hidden className="sr-only">
      {peers.map((p) => <PeerAudio key={p.peerId} stream={p.stream} />)}
    </div>
  );
}

function PeerAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    const play = () => { void el.play().catch(() => { /* resumed on first gesture */ }); };
    play();
    // Some browsers only deliver the audio track a moment after the peer
    // connects, so re-arm playback when the stream gains a track.
    stream.addEventListener("addtrack", play);
    // If the tab is backgrounded and the element gets paused, resume it.
    const onVisible = () => { if (document.visibilityState === "visible") play(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stream.removeEventListener("addtrack", play);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
export default function MeetRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params?.code;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [me, setMe] = useState<{ id: string; full_name: string } | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  // Lobby. `waitingForHost` holds this peer while a host decides; `canAdmit`
  // is set only for staff, who are the only ones shown the admit panel.
  const [waitingForHost, setWaitingForHost] = useState(false);
  const [admissionDenied, setAdmissionDenied] = useState(false);
  const [canAdmit, setCanAdmit] = useState(false);
  const [waitingGuests, setWaitingGuests] = useState<WaitingGuest[]>([]);
  const admissionPollRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (admissionPollRef.current) window.clearInterval(admissionPollRef.current);
  }, []);

  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null); // kept so we can restore after screen-share
  const sharingTrackRef = useRef<MediaStreamTrack | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Local recording. The recording never leaves the browser; stopping it
  // immediately downloads the WebM/MP4 file to this device.
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const recordingStopResolverRef = useRef<(() => void) | null>(null);
  const embeddedRef = useRef(false);

  // Peers
  const [remotes, setRemotes] = useState<RemotePeer[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const clientRef = useRef<CMeetClient | null>(null);

  // Chat (source of truth: CMeetClient.onChat - which already fires with self:true on send)
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiHints = useMemo(() => hintEmojis(chatInput), [chatInput]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Side panels
  const [showTag, setShowTag] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endingStream, setEndingStream] = useState(false);

  /* -------- Load meeting + session -------- */
  useEffect(() => {
    if (!code) return;
    embeddedRef.current = new URLSearchParams(window.location.search).get("embed") === "1";
    (async () => {
      const r = await fetch(`/api/cmeet/${code}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j.ok) setMeeting(j.meeting);
      try {
        const s = await fetch("/api/team/session").then((r) => (r.ok ? r.json() : null));
        if (s) {
          const fullName = s.full_name || s.member?.full_name || "";
          const id = s.member?.id || s.id || "";
          if (fullName) setName(fullName);
          if (id) setMe({ id, full_name: fullName });
        }
      } catch { /* guest */ }
    })();
  }, [code]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    const closeFromParent = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "cmeet:request-close") return;
      void hangUp();
    };
    window.addEventListener("message", closeFromParent);
    return () => window.removeEventListener("message", closeFromParent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- Autoscroll chat -------- */
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  /* -------- End-stream handling (host broadcasts sentinel) -------- */
  useEffect(() => {
    const last = chat[chat.length - 1];
    if (last && !last.self && last.body === "__host_ended_stream__") {
      hangUp({ notice: "The host has ended this stream." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat]);

  /* -------- Unmount cleanup -------- */
  useEffect(() => {
    return () => {
      try { clientRef.current?.leave(); } catch {}
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      sharingTrackRef.current?.stop();
      cameraTrackRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- Presence heartbeat (keeps the room from auto-closing) -------- */
  useEffect(() => {
    if (!joined || !code) return;
    const ping = () => {
      fetch(`/api/cmeet/${code}/heartbeat`, { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
    };
    ping();
    const interval = window.setInterval(ping, 60_000);
    return () => window.clearInterval(interval);
  }, [joined, code]);

  /* -------- Permissions & join -------- */
  const canJoinMeeting = Boolean(name.trim()) && !joining && !mediaError;

  async function joinMeeting() {
    if (!code || !name.trim() || !meeting || joining || mediaError) return;
    setJoining(true);
    setMediaError(null);

    try {
      const audio = true;
      const wantVideo = !meeting.audio_only;

      const stream = await navigator.mediaDevices.getUserMedia({
        // Ask the browser DSP for the same treatment Meet relies on: echo
        // cancellation, noise suppression and auto gain. Mono at 48kHz is what
        // Opus wants anyway, and halves the audio we have to ship per peer.
        audio: audio && {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
        video: wantVideo
          ? {
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 30, max: 30 },
              facingMode: "user",
            }
          : false,
      });
      // Tell the encoder this is a talking head, not sport - it will drop
      // resolution before it drops frames, which reads as much smoother.
      stream.getVideoTracks().forEach((t) => { t.contentHint = "motion"; });
      stream.getAudioTracks().forEach((t) => { t.contentHint = "speech"; });

      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);

      const peerId = crypto.randomUUID();

      // Ask to come in before any signaling happens. Staff and the client the
      // room was booked for are admitted immediately; anyone else waits here.
      const verdict = await requestAdmission(code, peerId, name);
      setCanAdmit(verdict.canAdmit);
      if (verdict.status !== "admitted") {
        setWaitingForHost(true);
        const decision = await new Promise<string>((resolve) => {
          const poll = window.setInterval(async () => {
            const status = await pollAdmission(code, peerId).catch(() => "waiting");
            if (status === "waiting") return;
            window.clearInterval(poll);
            resolve(status);
          }, 2000);
          admissionPollRef.current = poll;
        });
        setWaitingForHost(false);
        if (decision !== "admitted") {
          setAdmissionDenied(true);
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
      }

      const client = new CMeetClient(code, peerId, name, {
        onRemoteUpdate: (peers) => setRemotes([...peers]),
        onChat: (m) => setChat((prev) => [...prev, m]),
        onError: (e) => console.error("[cMeet]", e),
        onActiveSpeaker: (id) => setActiveSpeaker(id),
      });
      clientRef.current = client;
      await client.join(stream);

      setJoined(true);
    } catch (err: unknown) {
      console.error(err);
      const mediaErr = err instanceof DOMException || err instanceof Error ? err : null;
      setMediaError(
        mediaErr?.name === "NotAllowedError"
          ? "Camera or microphone permission was denied. Please allow access and retry."
          : mediaErr?.name === "NotFoundError"
            ? "No camera or microphone found. Check your device."
            : mediaErr?.message || "Couldn't access your camera/microphone."
      );
    } finally {
      setJoining(false);
    }
  }

  // Staff keep an eye on the lobby for as long as they are in the room.
  useEffect(() => {
    if (!joined || !canAdmit || !code) return;
    let active = true;
    const load = () => {
      fetchWaitingGuests(code)
        .then((guests) => { if (active) setWaitingGuests(guests); })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [joined, canAdmit, code]);

  async function decideGuest(requestId: string, admit: boolean) {
    if (!code) return;
    setWaitingGuests((prev) => prev.filter((guest) => guest.id !== requestId));
    await decideAdmission(code, requestId, admit);
  }

  /* -------- Controls -------- */
  function toggleMic() {
    if (!localStream) return;
    const next = !micOn;
    localStream.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }

  function toggleCam() {
    if (!localStreamRef.current) return;
    const next = !camOn;
    const camera = cameraTrackRef.current;
    if (camera) camera.enabled = next;
    else localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  }

  async function stopScreenShare() {
    const client = clientRef.current;
    const currentStream = localStreamRef.current;
    const sharedTrack = sharingTrackRef.current;
    if (!client || !currentStream || !sharedTrack) return;
    sharingTrackRef.current = null;
    sharedTrack.onended = null;
    try {
      let cameraTrack = cameraTrackRef.current;
      if (!cameraTrack || cameraTrack.readyState !== "live") {
        const fresh = await navigator.mediaDevices.getUserMedia({ video: true });
        cameraTrack = fresh.getVideoTracks()[0];
        cameraTrackRef.current = cameraTrack;
      }
      cameraTrack.enabled = camOn;
      await client.replaceVideoTrack(cameraTrack, { sharing: false });
      sharedTrack.stop();
      const nextStream = new MediaStream([...currentStream.getAudioTracks(), cameraTrack]);
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setSharing(false);
    } catch (error) {
      sharingTrackRef.current = sharedTrack;
      console.error("Stop share failed", error);
    }
  }

  async function toggleShare() {
    const client = clientRef.current;
    const currentStream = localStreamRef.current;
    if (!client || !currentStream) return;
    if (sharingTrackRef.current) {
      await stopScreenShare();
      return;
    }

    try {
      const disp = await navigator.mediaDevices.getDisplayMedia({
        // Text stays readable at full resolution; 15fps is plenty for slides
        // and keeps the extra pixels affordable.
        video: { frameRate: { ideal: 15, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
        audio: false,
      });
      const shareTrack: MediaStreamTrack = disp.getVideoTracks()[0];
      shareTrack.contentHint = "detail";
      const cameraTrack = currentStream.getVideoTracks()[0];
      if (cameraTrack && cameraTrack !== sharingTrackRef.current) cameraTrackRef.current = cameraTrack;
      sharingTrackRef.current = shareTrack;
      shareTrack.onended = () => { void stopScreenShare(); };

      await client.replaceVideoTrack(shareTrack, { sharing: true });
      const nextStream = new MediaStream([...currentStream.getAudioTracks(), shareTrack]);
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setSharing(true);
    } catch (e) {
      const failedTrack = sharingTrackRef.current;
      if (failedTrack) {
        failedTrack.onended = null;
        failedTrack.stop();
      }
      sharingTrackRef.current = null;
      console.warn("Screen share cancelled", e);
    }
  }

  function stopRecording(): Promise<void> {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return Promise.resolve();
    return new Promise((resolve) => {
      recordingStopResolverRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        recordingStopResolverRef.current = null;
        resolve();
      }
    });
  }

  async function startRecording() {
    if (recorderRef.current?.state === "recording") return;
    if (typeof MediaRecorder === "undefined") {
      await appAlert("Call recording is not supported by this browser.");
      return;
    }
    const streams = [localStreamRef.current, ...remotes.map((peer) => peer.stream)].filter(Boolean) as MediaStream[];
    const output = new MediaStream();
    const featured = remoteSharing?.stream || (sharingTrackRef.current ? localStreamRef.current : remotes[0]?.stream) || localStreamRef.current;
    const videoTrack = featured?.getVideoTracks()[0];
    if (videoTrack) output.addTrack(videoTrack);

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    for (const stream of streams) {
      const audioTracks = stream.getAudioTracks().filter((track) => track.readyState === "live");
      if (!audioTracks.length) continue;
      const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
      source.connect(destination);
    }
    const mixedAudio = destination.stream.getAudioTracks()[0];
    if (mixedAudio) {
      output.addTrack(mixedAudio);
      recordingAudioTrackRef.current = mixedAudio;
    }
    await audioContext.resume().catch(() => undefined);
    recordingAudioContextRef.current = audioContext;

    const mimeType = (videoTrack ? [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ] : [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ]).find((type) => MediaRecorder.isTypeSupported(type));
    try {
      const recorder = new MediaRecorder(output, mimeType ? { mimeType, videoBitsPerSecond: 2_000_000 } : undefined);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(recordingChunksRef.current, { type });
        if (blob.size) {
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          const safeTitle = (meeting?.title || "cmeet-call").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
          anchor.href = objectUrl;
          const extension = type.includes("mp4") ? (videoTrack ? "mp4" : "m4a") : "webm";
          anchor.download = `${safeTitle || "cmeet-call"}-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
        }
        recordingChunksRef.current = [];
        recordingAudioTrackRef.current?.stop();
        recordingAudioTrackRef.current = null;
        void recordingAudioContextRef.current?.close();
        recordingAudioContextRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        recordingStopResolverRef.current?.();
        recordingStopResolverRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start(1_000);
      setRecording(true);
    } catch (error) {
      recordingAudioTrackRef.current?.stop();
      void audioContext.close();
      recordingAudioContextRef.current = null;
      await appAlert(error instanceof Error ? error.message : "The recording could not start.");
    }
  }

  function sendChat() {
    const body = chatInput.trim();
    if (!body || !clientRef.current) return;
    clientRef.current.sendChat(body);
    setChatInput("");
  }

  async function hangUp(opts?: { notice?: string }) {
    await stopRecording();
    try { clientRef.current?.leave(); } catch {}
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (cameraTrackRef.current) { try { cameraTrackRef.current.stop(); } catch {} }
    clientRef.current = null;
    setJoined(false);
    if (opts?.notice) appAlert(opts.notice);
    if (embeddedRef.current && window.parent !== window) {
      window.parent.postMessage({ type: "cmeet:close" }, window.location.origin);
    } else {
      router.push("/team/cmeet");
    }
  }

  async function endStreamForEveryone() {
    if (!code) return;
    setEndingStream(true);
    try {
      await fetch(`/api/cmeet/${code}`, { method: "DELETE" });
      try { clientRef.current?.sendChat("__host_ended_stream__"); } catch {}
      await hangUp();
    } finally {
      setEndingStream(false);
    }
  }

  /* -------- Derived: is the viewer host/admin? -------- */
  const canEndStream = useMemo(() => {
    if (!meeting) return false;
    if (meeting.created_by_admin) return true;
    if (me?.id && meeting.created_by === me.id) return true;
    return false;
  }, [meeting, me]);

  /* -------- Derived: presenter + thumbnails -------- */
  const remoteSharing = useMemo(() => remotes.find((r) => r.isSharingScreen) || null, [remotes]);
  const presenter: "local" | { kind: "remote"; peer: RemotePeer } | null =
    sharing ? "local" : remoteSharing ? { kind: "remote", peer: remoteSharing } : null;

  /* ---------------------------------------------------------------- */
  if (!code) return null;
  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A1130] text-white">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  /* -------- Lobby: denied -------- */
  if (admissionDenied) {
    return (
      <div className="min-h-screen bg-[#0A1130] text-white flex items-center justify-center p-4">
        <div className="bg-[#0F1A4A] rounded-2xl p-6 w-full max-w-sm border border-white/10 text-center">
          <h1 className="text-lg font-bold">Not admitted</h1>
          <p className="mt-2 text-sm text-white/60">
            The host did not let you into this meeting. If you think that is a mistake, contact them and try the link again.
          </p>
          <button
            type="button"
            onClick={() => { setAdmissionDenied(false); }}
            className="mt-5 h-11 w-full rounded-xl bg-white/10 text-sm font-semibold hover:bg-white/15"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  /* -------- Lobby: waiting on the host -------- */
  if (waitingForHost) {
    return (
      <div className="min-h-screen bg-[#0A1130] text-white flex items-center justify-center p-4">
        <div className="bg-[#0F1A4A] rounded-2xl p-6 w-full max-w-sm border border-white/10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-white/70" />
          <h1 className="mt-4 text-lg font-bold">Waiting to be let in</h1>
          <p className="mt-2 text-sm text-white/60">
            The host has been asked to admit you. Keep this tab open.
          </p>
          <p className="mt-4 text-xs text-white/35">{meeting.title}</p>
        </div>
      </div>
    );
  }

  /* -------- Join screen -------- */
  if (!joined) {
    return (
      <div className="min-h-screen bg-[#0A1130] text-white flex items-center justify-center p-4">
        <div className="bg-[#0F1A4A] rounded-2xl p-6 w-full max-w-sm border border-white/10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#6B92FF] mb-2">CDS Space · cMeet</p>
          <h1 className="text-[20px] font-bold mb-1">{meeting.title}</h1>
          <p className="text-[12px] text-white/60 mb-5">
            {meeting.audio_only ? "Audio-only call" : "Video call"} · Room <span className="font-mono">{code}</span>
          </p>
          <label className="block text-[11px] text-white/60 mb-1.5">Your name</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (mediaError) setMediaError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && canJoinMeeting && joinMeeting()}
            placeholder="Alex Doe"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[13px] focus:outline-none focus:border-white/20"
          />
          {mediaError && (
            <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
              {mediaError}
            </div>
          )}
          <button
            onClick={joinMeeting}
            disabled={!canJoinMeeting}
            className="mt-4 w-full px-4 py-3 rounded-xl bg-[#0A4FE8] text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            {joining ? "Connecting…" : "Join meeting"}
          </button>
        </div>
      </div>
    );
  }

  /* -------- In-call UI -------- */
  return (
    <div className="relative h-screen bg-[#0A1130] text-white flex flex-col">
      <header className="px-5 py-3 border-b border-white/10 flex items-center gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] uppercase tracking-[0.2em] text-[#6B92FF]">CDS Space · cMeet</p>
          <h1 className="text-[14px] font-bold truncate">{meeting.title}</h1>
        </div>
        <div className="inline-flex items-center gap-1.5 text-[11px] text-white/60">
          <Users className="w-3.5 h-3.5" /> {remotes.length + 1}
        </div>
        <p className="text-[11px] text-white/60 font-mono">{code}</p>
      </header>

      {/* Mounted once per peer for the whole call - see RemoteAudio. */}
      <RemoteAudio peers={remotes} />

      {/* Lobby. Only staff ever receive entries here: the invited client is
          admitted by the server and never knocks. */}
      {canAdmit && waitingGuests.length > 0 && (
        <div className="absolute right-4 top-20 z-40 w-[min(92vw,320px)] rounded-2xl border border-white/10 bg-[#0F1A4A] p-3 shadow-2xl">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-white/50">
            Waiting to join ({waitingGuests.length})
          </p>
          <ul className="mt-2 space-y-2">
            {waitingGuests.map((guest) => (
              <li key={guest.id} className="rounded-xl bg-white/5 p-2.5">
                <p className="truncate text-sm font-semibold">{guest.name}</p>
                {guest.email && <p className="truncate text-[11px] text-white/45">{guest.email}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => decideGuest(guest.id, true)}
                    className="h-8 flex-1 rounded-lg bg-[#0A4FE8] text-[12px] font-bold hover:bg-[#083FC0]"
                  >
                    Admit
                  </button>
                  <button
                    type="button"
                    onClick={() => decideGuest(guest.id, false)}
                    className="h-8 flex-1 rounded-lg bg-white/10 text-[12px] font-bold hover:bg-white/15"
                  >
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <main className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 p-4 flex flex-col gap-3 min-h-0">
          {presenter ? (
            <>
              {/* Big presenter stage */}
              <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-black border border-white/10 relative">
                {presenter === "local" ? (
                  <VideoTile key={localStream?.id || "local"} stream={localStream} muted objectFit="contain" />
                ) : (
                  <VideoTile key={presenter.peer.stream.id} stream={presenter.peer.stream} muted objectFit="contain" />
                )}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/70 text-[11px] font-medium inline-flex items-center gap-1.5">
                  <ScreenShare className="w-3 h-3" />
                  {presenter === "local" ? `${name} (you) · presenting` : `${presenter.peer.name} · presenting`}
                </div>
              </div>

              {/* Participant strip */}
              <div className="shrink-0 flex gap-2 overflow-x-auto pb-1">
                {/* Local thumb only shown when the presenter is someone else */}
                {presenter !== "local" && (
                  <ParticipantTile
                    key="local-thumb"
                    stream={localStream}
                    label={`${name} (you)`}
                    muted
                    showVideoOff={!camOn}
                  />
                )}
                {remotes
                  .filter((p) => presenter === "local" || p.peerId !== presenter.peer.peerId)
                  .map((p) => (
                    <ParticipantTile
                      key={p.peerId}
                      stream={p.stream}
                      label={`${p.name}${p.isHost ? " · host" : ""}`}
                      showVideoOff={!p.hasVideo}
                      speaking={activeSpeaker === p.peerId}
                      quality={p.quality}
                    />
                  ))}
              </div>
            </>
          ) : (
            /* Grid */
            <div className="flex-1 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-[minmax(200px,1fr)] overflow-y-auto">
              <ParticipantTile stream={localStream} label={`${name} (you)`} muted showVideoOff={!camOn} large />
              {remotes.map((p) => (
                <ParticipantTile
                  key={p.peerId}
                  stream={p.stream}
                  label={`${p.name}${p.isHost ? " · host" : ""}`}
                  showVideoOff={!p.hasVideo}
                  speaking={activeSpeaker === p.peerId}
                  quality={p.quality}
                  large
                />
              ))}
            </div>
          )}
        </div>

        {showChat && (
          <aside className="w-full sm:w-[340px] border-l border-white/10 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
              <p className="text-[13px] font-semibold">In-call chat</p>
              <button onClick={() => setShowChat(false)} className="p-1.5 rounded-lg hover:bg-white/5">
                <XIcon className="w-4 h-4 text-white/60" />
              </button>
            </div>
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-[12.5px]">
              {chat.length === 0 && <p className="text-center text-white/40 mt-6">Say something…</p>}
              {chat
                .filter((m) => m.body !== "__host_ended_stream__")
                .map((m, i) => (
                  <div key={`${m.at}-${i}`} className={m.self ? "text-right" : ""}>
                    <p className="text-[10px] text-white/50 mb-0.5">{m.self ? "You" : m.name}</p>
                    <p
                      className={`inline-block px-3 py-1.5 rounded-xl break-words max-w-[240px] ${
                        m.self ? "bg-[#0A4FE8] text-white" : "bg-white/10"
                      }`}
                    >
                      {m.body}
                    </p>
                  </div>
                ))}
            </div>
            <div className="border-t border-white/10 p-3 shrink-0">
              {emojiHints.length > 0 && (
                <div className="mb-2 flex items-center gap-1 flex-wrap">
                  {emojiHints.map((e, i) => (
                    <button key={i} onClick={() => setChatInput((c) => c + e)} className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-[14px]">{e}</button>
                  ))}
                </div>
              )}
              {showEmoji && (
                <div className="mb-2 flex items-center gap-1 flex-wrap text-[18px]">
                  {["👍","🙌","🔥","💯","😂","❤️","🎉","✅","🤔","👀"].map((e) => (
                    <button key={e} onClick={() => setChatInput((c) => c + e)} className="px-1.5 py-0.5 rounded hover:bg-white/10">{e}</button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => setShowEmoji(!showEmoji)} className="p-2 rounded-lg hover:bg-white/5 text-white/60">
                  <Smile className="w-4 h-4" />
                </button>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())}
                  placeholder="Message the call…"
                  className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[12.5px] focus:outline-none focus:border-white/20"
                />
                <button onClick={sendChat} disabled={!chatInput.trim()} className="p-2 rounded-lg bg-[#0A4FE8] disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>
        )}
      </main>

      <footer className="px-3 md:px-5 py-3 border-t border-white/10 flex items-center justify-center gap-2 flex-wrap shrink-0">
        <ControlButton onClick={toggleMic} active={!micOn} icon={micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />} title={micOn ? "Mute" : "Unmute"} />
        {!meeting.audio_only && (
          <ControlButton onClick={toggleCam} active={!camOn} icon={camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />} title={camOn ? "Turn camera off" : "Turn camera on"} />
        )}
        {!meeting.audio_only && (
          <ControlButton onClick={toggleShare} active={sharing} icon={sharing ? <ScreenShareOff className="w-4 h-4" /> : <ScreenShare className="w-4 h-4" />} title={sharing ? "Stop sharing" : "Share your screen"} />
        )}
        <ControlButton onClick={() => setShowChat(!showChat)} active={showChat} icon={<MessageCircle className="w-4 h-4" />} title="Chat" />
        <ControlButton
          onClick={() => { if (recording) void stopRecording(); else void startRecording(); }}
          active={recording}
          icon={recording ? <CircleStop className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
          title={recording ? "Stop and save recording" : "Record this call to your device"}
        />
        <ControlButton onClick={() => setShowTag(true)} active={showTag} icon={<AtSign className="w-4 h-4" />} title="Tag teammates" />
        <UniversalShareButton
          title={meeting.title}
          text={`Join the live meeting "${meeting.title}" on CDS Space cMeet.`}
          url={`/meet/${code}`}
          label=""
          className="h-9 min-h-9 w-9 rounded-full border-white/10 bg-white/5 p-0 text-white shadow-none hover:border-white/20 hover:bg-white/10"
        />
        {canEndStream && (
          <button
            onClick={() => setShowEndConfirm(true)}
            className="ml-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-700 text-white text-[12.5px] font-semibold hover:bg-rose-800"
            title="End stream for everyone"
          >
            <CircleStop className="w-4 h-4" /> End stream
          </button>
        )}
        <button onClick={() => void hangUp()} className="ml-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-600 text-white text-[12.5px] font-semibold">
          <PhoneOff className="w-4 h-4" /> Leave
        </button>
      </footer>

      {showTag && <TagMembersModal code={code!} onClose={() => setShowTag(false)} />}
      {showEndConfirm && (
        <EndStreamConfirm
          busy={endingStream}
          onCancel={() => setShowEndConfirm(false)}
          onConfirm={async () => { await endStreamForEveryone(); setShowEndConfirm(false); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Participant tile                                                  */
/* ------------------------------------------------------------------ */
function ParticipantTile({
  stream,
  label,
  showVideoOff = false,
  large = false,
  speaking = false,
  quality = "good",
}: {
  stream: MediaStream | null;
  label: string;
  /** Kept for call-site compatibility; every tile is muted - audio plays from RemoteAudio. */
  muted?: boolean;
  showVideoOff?: boolean;
  large?: boolean;
  speaking?: boolean;
  quality?: ConnectionQuality;
}) {
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-black border transition-[box-shadow,border-color] duration-200 ${speaking ? "border-[#5B8CFF] shadow-[0_0_0_2px_rgba(91,140,255,0.55)]" : "border-white/10"} ${large ? "w-full h-full" : "w-[180px] h-[110px] shrink-0"}`}>
      <VideoTile stream={stream} muted />
      {quality !== "good" && (
        <div
          title={quality === "poor" ? "Weak connection" : "Unstable connection"}
          className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-semibold ${quality === "poor" ? "bg-rose-500/85" : "bg-amber-400/85 text-black"}`}
        >
          {quality === "poor" ? "Weak" : "Unstable"}
        </div>
      )}
      {showVideoOff && (
        <div className="absolute inset-0 bg-[#0A1130]/80 flex items-center justify-center">
          <VideoOff className={`${large ? "w-7 h-7" : "w-4 h-4"} text-white/40`} />
        </div>
      )}
      <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 ${large ? "text-[11px]" : "text-[9.5px]"} truncate max-w-[90%]`}>
        {label}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Control button                                                    */
/* ------------------------------------------------------------------ */
function ControlButton({
  onClick, active, icon, title,
}: { onClick: () => void; active: boolean; icon: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
        active ? "bg-rose-500/80 text-white" : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {icon}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  End-stream confirm                                                */
/* ------------------------------------------------------------------ */
function EndStreamConfirm({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-[#0F1A4A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-5 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-300 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[14px] font-bold">End the stream for everyone?</p>
            <p className="text-[12px] text-white/60 mt-1">
              All participants will be kicked out and the room will be marked ended. This can&apos;t be undone.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 rounded-xl text-[12.5px] font-medium text-white/80 hover:bg-white/5">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-[12.5px] font-semibold hover:bg-rose-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CircleStop className="w-3.5 h-3.5" />}
            End stream
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tag teammates modal                                               */
/* ------------------------------------------------------------------ */
interface MemberLite { id: string; full_name: string; username: string; avatar_url: string | null; role_title: string | null }
function TagMembersModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/admin/members-list", { credentials: "include" }).catch(() => null);
      if (r?.ok) {
        const j = await r.json();
        if (j.ok) setMembers(j.members || []);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) =>
      !q ||
      m.full_name.toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q) ||
      (m.role_title || "").toLowerCase().includes(q)
    );
  }, [members, search]);

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function send() {
    if (picked.size === 0) return;
    setSending(true);
    try {
      const r = await fetch(`/api/cmeet/${code}/tag-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_ids: Array.from(picked) }),
      });
      const j = await r.json();
      if (r.ok && j.ok) {
        setDone(j.notified ?? picked.size);
        setTimeout(onClose, 1400);
      } else {
        appAlert(j.error || "Couldn't tag teammates");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0F1A4A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md text-white flex flex-col max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2"><AtSign className="w-4 h-4 text-[#6B92FF]" /><p className="text-[14px] font-bold">Tag teammates</p></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><XIcon className="w-4 h-4 text-white/60" /></button>
        </div>
        <div className="px-5 py-3 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teammates…" className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[12.5px] focus:outline-none focus:border-white/20" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-white/60" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-white/50">No teammates match your search.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {filtered.map((m) => {
                const on = picked.has(m.id);
                return (
                  <li key={m.id}>
                    <button onClick={() => toggle(m.id)} className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition ${on ? "bg-[#0A4FE8]/15" : "hover:bg-white/5"}`}>
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.full_name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold">{m.full_name.charAt(0).toUpperCase()}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold truncate">{m.full_name}</p>
                        <p className="text-[11px] text-white/50 truncate">@{m.username}{m.role_title ? ` · ${m.role_title}` : ""}</p>
                      </div>
                      <div className={`w-4 h-4 rounded border ${on ? "bg-[#0A4FE8] border-[#0A4FE8]" : "border-white/20"} flex items-center justify-center`}>
                        {on && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between bg-black/20">
          <p className="text-[11.5px] text-white/60">
            {picked.size === 0 ? "Pick who to notify" : `${picked.size} selected`}
            {done !== null && <span className="ml-2 text-emerald-300">✓ Notified {done} teammate{done === 1 ? "" : "s"}</span>}
          </p>
          <button onClick={send} disabled={picked.size === 0 || sending} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A4FE8] text-white text-[12.5px] font-semibold hover:bg-[#083EC0] transition disabled:opacity-50">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Notify
          </button>
        </div>
      </div>
    </div>
  );
}
