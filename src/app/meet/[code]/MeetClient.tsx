"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, ScreenShare, ScreenShareOff,
  MessageCircle, Send, Smile, X as XIcon, Loader2, Check,
  CircleStop, AlertTriangle, Users, Circle, Languages, Hand, MoreHorizontal,
  Camera, Clock, ListChecks, RotateCcw, Minus, Maximize2, Moon, Sun, Info, VolumeX,
  Plus,
  LockKeyhole,
  Share2,
} from "lucide-react";
import {
  requestAdmission, pollAdmission, fetchWaitingGuests, decideAdmission, fetchCMeetIceServers,
  guestTokenFromUrl, type WaitingGuest,
} from "@/lib/cmeet-admission";
import { CMeetClient, type RemotePeer, type ChatMessage, type ConnectionQuality, type CMeetParticipantKind } from "@/lib/cmeet-rtc";
import { appAlert, appConfirm } from "@/lib/app-notify";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { ViewportPortal } from "@/components/ui/ViewportPortal";
import { buildCMeetPath } from "@/lib/cmeet-links";
import {
  CMEET_LANGUAGES,
  CMeetTranslationSidecar,
  DEFAULT_TRANSLATION_PREFERENCES,
  languageBadge,
  loadCMeetTranslationPreferences,
  primeCMeetTranslationPlayback,
  saveCMeetTranslationPreferences,
  warmCMeetTranslation,
  type CMeetTranslationPreferences,
} from "@/lib/cmeet-translation";

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
  can_end_stream: boolean;
  can_approve?: boolean;
  status?: string;
  approval_status?: "pending" | "approved" | "rejected";
}

interface AgendaItem {
  id: string;
  position: number;
  title: string;
  completed_at: string | null;
}

type PictureInPictureVideo = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<unknown>;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: "inline" | "picture-in-picture") => void;
  webkitPresentationMode?: string;
};

type ConfirmableControlAction = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  run: () => void | Promise<void>;
};

/**
 * A caption shows what is being said right now, not a transcript of the call.
 *
 * Even a single utterance can run long, so the tail is kept and cut back to a
 * word boundary. Everything already said has been heard; what the reader needs
 * on screen is the part that has just landed.
 */
const CAPTION_MAX_CHARS = 180;

export function trimCaption(text: string) {
  const clean = text.replace(/\s+/g, " ").trimStart();
  if (clean.length <= CAPTION_MAX_CHARS) return clean;
  const tail = clean.slice(clean.length - CAPTION_MAX_CHARS);
  const boundary = tail.indexOf(" ");
  // Drop the partial first word so a caption never opens mid-word.
  return (boundary === -1 ? tail : tail.slice(boundary + 1)).trimStart();
}

type SpeechAudioConstraints = MediaTrackConstraints & {
  latency?: number | { ideal: number };
  voiceIsolation?: boolean | { ideal: boolean };
};

/**
 * Build a speech-first capture profile from capabilities the browser reports.
 * Native acoustic echo cancellation needs the browser's playback reference,
 * so it is applied at capture time rather than through a detached Web Audio
 * graph. Voice isolation is requested on browsers that expose it.
 */
export function buildCMeetSpeechAudioConstraints(
  supported: MediaTrackSupportedConstraints = navigator.mediaDevices.getSupportedConstraints(),
): SpeechAudioConstraints {
  const available = supported as MediaTrackSupportedConstraints & { voiceIsolation?: boolean };
  const constraints: SpeechAudioConstraints = {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48_000 },
    sampleSize: { ideal: 16 },
    latency: { ideal: 0.02 },
  };
  if (available.echoCancellation !== false) constraints.echoCancellation = { ideal: true };
  if (available.noiseSuppression !== false) constraints.noiseSuppression = { ideal: true };
  if (available.autoGainControl !== false) constraints.autoGainControl = { ideal: true };
  if (available.voiceIsolation) constraints.voiceIsolation = { ideal: true };
  return constraints;
}

type MeetingSound = "participant-joined" | "participant-left" | "message" | "hand-raised" | "host-action";
let meetingSoundContext: AudioContext | null = null;

function ensureMeetingSoundContext() {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  if (!meetingSoundContext || meetingSoundContext.state === "closed") {
    meetingSoundContext = new Context({ latencyHint: "interactive" });
  }
  return meetingSoundContext;
}

function primeMeetingSounds() {
  const context = ensureMeetingSoundContext();
  if (context?.state === "suspended") void context.resume().catch(() => undefined);
}

function playMeetingSound(kind: MeetingSound) {
  const context = ensureMeetingSoundContext();
  if (!context) return;
  const patterns: Record<MeetingSound, Array<[number, number]>> = {
    "participant-joined": [[523, 0], [659, 0.11]],
    "participant-left": [[440, 0], [330, 0.11]],
    message: [[784, 0]],
    "hand-raised": [[659, 0], [880, 0.1], [1047, 0.2]],
    "host-action": [[294, 0], [220, 0.12]],
  };
  const schedule = () => {
    const start = context.currentTime + 0.01;
    patterns[kind].forEach(([frequency, offset]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.055, start + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.09);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.1);
    });
  };
  if (context.state === "suspended") void context.resume().then(schedule).catch(() => undefined);
  else schedule();
}

const PEER_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

function peerIdForRoom(code: string) {
  const key = `cds.cmeet.peer.${code}`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing && PEER_ID_PATTERN.test(existing)) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function forgetPeerId(code: string) {
  try { window.sessionStorage.removeItem(`cds.cmeet.peer.${code}`); } catch { /* storage is optional */ }
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
      const play = () => {
        if (el.srcObject !== stream) el.srcObject = stream;
        void el.play().catch(() => {
          // Every meeting tile is intentionally muted; setting the DOM
          // property as well as the React prop handles stricter iOS autoplay.
          el.muted = true;
          void el.play().catch(() => undefined);
        });
      };
      const reapply = () => {
        if (el.srcObject !== stream) el.srcObject = stream;
        play();
      };
      stream.addEventListener("addtrack", reapply);
      stream.addEventListener("removetrack", reapply);
      el.addEventListener("loadedmetadata", play);
      // Autoplay can be blocked on Safari/iOS until user interaction - retry once muted.
      play();
      return () => {
        stream.removeEventListener("addtrack", reapply);
        stream.removeEventListener("removetrack", reapply);
        el.removeEventListener("loadedmetadata", play);
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
function RemoteAudio({
  peers,
  translatedPeerIds,
}: {
  peers: RemotePeer[];
  /** Speakers whose translated audio is playing right now. */
  translatedPeerIds: Set<string>;
}) {
  return (
    <div aria-hidden className="sr-only">
      {peers.map((peer) => (
        <PeerAudio
          key={peer.peerId}
          stream={peer.stream}
          // Translation is an exclusive route per speaker: keeping the original
          // live alongside it gives two voices at once. Everyone else in the
          // room is still heard in their own voice, and a speaker whose
          // translation drops out gets their real voice back immediately.
          enabled={!translatedPeerIds.has(peer.peerId)}
        />
      ))}
    </div>
  );
}

function PeerAudio({ stream, enabled }: { stream: MediaStream; enabled: boolean }) {
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
  useEffect(() => {
    if (ref.current) ref.current.muted = !enabled;
  }, [enabled]);
  return <audio ref={ref} autoPlay playsInline muted={!enabled} />;
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
// An embedded room (?embed=1) reports close/minimize to whatever hosts it: the
// dashboard's iframe, or the mobile app's in-app web view, which runs the room
// as a top-level page. Returns false when nothing hosts it.
const fileSafeTitle = (title?: string | null) =>
  (title || "cmeet-call").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "cmeet-call";
const fileStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Hands a file (recording, screenshot) to the mobile app in base64 pieces;
// the app writes them to a file and saves or shares it.
async function sendFileToApp(blob: Blob, name: string, kind: "recording" | "screenshot") {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  postToEmbedHost({ type: "cmeet:file-start", id, name, mime: blob.type, kind });
  const slice = 3 * 170 * 1024; // a multiple of 3, so each piece encodes on its own
  for (let offset = 0; offset < blob.size; offset += slice) {
    postToEmbedHost({ type: "cmeet:file-chunk", id, data: await blobToBase64(blob.slice(offset, offset + slice)) });
  }
  postToEmbedHost({ type: "cmeet:file-end", id });
}

// A picture of the call: every visible video tile in a grid, cropped like the
// tiles on screen. Remote WebRTC and camera video can be drawn to a canvas.
function captureCallImage(): Promise<Blob | null> {
  const videos = Array.from(document.querySelectorAll("video")).filter((video) => {
    const box = video.getBoundingClientRect();
    return video.videoWidth > 0 && box.width > 40 && box.height > 40;
  });
  if (!videos.length) return Promise.resolve(null);
  const cols = Math.ceil(Math.sqrt(videos.length));
  const rows = Math.ceil(videos.length / cols);
  const cellW = 640, cellH = 480, gap = 12;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cellW + (cols + 1) * gap;
  canvas.height = rows * cellH + (rows + 1) * gap;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#0A1130";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  videos.forEach((video, index) => {
    const x = gap + (index % cols) * (cellW + gap);
    const y = gap + Math.floor(index / cols) * (cellH + gap);
    const scale = Math.max(cellW / video.videoWidth, cellH / video.videoHeight);
    const sw = cellW / scale, sh = cellH / scale;
    ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, x, y, cellW, cellH);
  });
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9));
}

type NativeHostWindow = Window & { ReactNativeWebView?: { postMessage(data: string): void } };

function inMobileApp() {
  return Boolean((window as NativeHostWindow).ReactNativeWebView);
}

function postToEmbedHost(message: { type: string } & Record<string, unknown>) {
  const native = (window as NativeHostWindow).ReactNativeWebView;
  if (native) {
    native.postMessage(JSON.stringify(message));
    return true;
  }
  if (window.parent !== window) {
    window.parent.postMessage(message, window.location.origin);
    return true;
  }
  return false;
}

export default function MeetRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params?.code;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  // Whether anyone from support is coming, for a client who called in.
  const [support, setSupport] = useState<{
    waitingForStaff: boolean;
    ringingSeconds: number;
    unavailable: boolean;
    rescheduledFor: string | null;
    passedTo: string | null;
  } | null>(null);
  const [exitPath, setExitPath] = useState<"/admin/cmeet" | "/team/cmeet" | "/dashboard/cmeet" | "/login">("/login");
  const [me, setMe] = useState<{ id: string | null; full_name: string; avatar_url: string | null; kind: CMeetParticipantKind; is_super_admin: boolean } | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [hasLeft, setHasLeft] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  // Lobby. `waitingForHost` holds this peer while a host decides; `canAdmit`
  // is server-verified for admin hosts and authenticated creator co-hosts.
  const [waitingForHost, setWaitingForHost] = useState(false);
  const [admissionDenied, setAdmissionDenied] = useState(false);
  const [canAdmit, setCanAdmit] = useState(false);
  const [meetingRole, setMeetingRole] = useState<"host" | "co-host" | null>(null);
  const [waitingGuests, setWaitingGuests] = useState<WaitingGuest[]>([]);
  const admissionPollRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (admissionPollRef.current) window.clearInterval(admissionPollRef.current);
  }, []);

  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const micOnRef = useRef(true);
  const camOnRef = useRef(true);
  const [sharing, setSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null); // kept so we can restore after screen-share
  const sharingTrackRef = useRef<MediaStreamTrack | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pictureInPictureVideoRef = useRef<HTMLVideoElement | null>(null);

  // Local recording. The recording never leaves the browser; stopping it
  // immediately downloads the WebM/MP4 file to this device.
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const recordingStopResolverRef = useRef<(() => void) | null>(null);
  const embeddedRef = useRef(false);
  // Running inside the CDS Space mobile app (embedded in its web view): some
  // browser-only features are handed to the app instead (see postToEmbedHost).
  const inAppRef = useRef(false);
  const [inApp, setInApp] = useState(false);
  const autoJoinAttemptedRef = useRef(false);

  // Peers
  const [remotes, setRemotes] = useState<RemotePeer[]>([]);
  const remotesRef = useRef<RemotePeer[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const clientRef = useRef<CMeetClient | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const pictureInPictureStream = useMemo(() => {
    if (sharing && screenStream) return screenStream;
    const remotePresenter = remotes.find((peer) => peer.isSharingScreen);
    if (remotePresenter?.screenStream.getVideoTracks().length) return remotePresenter.screenStream;
    return remotes.find((peer) => peer.peerId === activeSpeaker)?.stream || localStream;
  }, [activeSpeaker, localStream, remotes, screenStream, sharing]);

  // Live translation is deliberately independent from the meeting mesh. Each
  // listener gets translated copies of the remote speaker tracks they need.
  const [translation, setTranslation] = useState<CMeetTranslationPreferences>(DEFAULT_TRANSLATION_PREFERENCES);
  const [translationReady, setTranslationReady] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationState, setTranslationState] = useState<"off" | "connecting" | "live" | "unavailable">("off");
  /**
   * The line each speaker is saying right now. `done` marks the utterance
   * finished, so the next delta starts a fresh caption instead of continuing
   * the last sentence - which is what produced the endless run-on line.
   */
  const [translatedCaptions, setTranslatedCaptions] = useState<Record<string, { text: string; done: boolean }>>({});
  const translationSidecarsRef = useRef<Map<string, CMeetTranslationSidecar>>(new Map());
  const translationRetryCountRef = useRef(0);
  /** Per speaker, the pending "clear this caption" timer, so a new sentence can cancel it. */
  const captionClearTimersRef = useRef<Map<string, number>>(new Map());
  const [translationRetryNonce, setTranslationRetryNonce] = useState(0);
  /** Speakers whose translated audio is playing, so only their real voice is muted. */
  const [translatedPeerIds, setTranslatedPeerIds] = useState<Set<string>>(new Set());
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [showMoreControls, setShowMoreControls] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [agendaBusyId, setAgendaBusyId] = useState<string | null>(null);
  const [agendaAdding, setAgendaAdding] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [meetingTheme, setMeetingTheme] = useState<"light" | "dark">("light");
  const [pendingControlAction, setPendingControlAction] = useState<ConfirmableControlAction | null>(null);

  useEffect(() => {
    remotesRef.current = remotes;
  }, [remotes]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("cmeet_theme");
      if (saved === "dark" || saved === "light") setMeetingTheme(saved);
    } catch { /* Light mode remains the standard default. */ }
  }, []);

  // Chat (source of truth: CMeetClient.onChat - which already fires with self:true on send)
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiHints = useMemo(() => hintEmojis(chatInput), [chatInput]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Side panels
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endingStream, setEndingStream] = useState(false);

  /* -------- Load meeting + session -------- */
  useEffect(() => {
    if (!code) return;
    embeddedRef.current = new URLSearchParams(window.location.search).get("embed") === "1";
    inAppRef.current = embeddedRef.current && inMobileApp();
    setInApp(inAppRef.current);
    (async () => {
      const r = await fetch(`/api/cmeet/${code}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        setMeeting(j.meeting);
        setSupport(j.support ?? null);
        setExitPath(
          j.return_to === "/admin/cmeet" || j.return_to === "/team/cmeet" || j.return_to === "/dashboard/cmeet"
            ? j.return_to
            : "/login",
        );
        const viewer = j.viewer;
        const fullName = String(viewer?.name || "").trim();
        if (fullName) setName(fullName);
        if (viewer) {
          setMe({
            id: viewer.id || null,
            full_name: fullName,
            avatar_url: viewer.kind === "admin" ? "/favicon.png" : viewer.avatar_url || null,
            kind: viewer.kind === "admin" || viewer.kind === "team" || viewer.kind === "client" ? viewer.kind : "guest",
            is_super_admin: Boolean(viewer.is_super_admin),
          });
        }
      }
    })();
  }, [code]);

  useEffect(() => {
    if (!meeting || !name.trim() || joining || joined || autoJoinAttemptedRef.current) return;
    if (new URLSearchParams(window.location.search).get("join") !== "1") return;
    if (meeting.approval_status === "pending" || meeting.approval_status === "rejected") return;
    autoJoinAttemptedRef.current = true;
    void joinMeeting();
  }, [joined, joining, meeting, name]);

  // A requester can keep the link open while an admin reviews it. Once the
  // admin approves, this lightweight poll replaces the pending card with the
  // join screen without asking the user to refresh.
  useEffect(() => {
    if (!code || meeting?.approval_status !== "pending") return;
    let active = true;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/cmeet/${encodeURIComponent(code)}`, { cache: "no-store" }).catch(() => null);
      const payload = await response?.json().catch(() => null);
      if (active && response?.ok && payload?.meeting) {
        setMeeting(payload.meeting);
        setSupport(payload.support ?? null);
      }
    }, 4_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [code, meeting?.approval_status]);

  useEffect(() => {
    if (!joined || !code) return;
    let active = true;
    const loadAgenda = async () => {
      const query = new URLSearchParams();
      if (peerIdRef.current) query.set("peer", peerIdRef.current);
      const guestToken = guestTokenFromUrl();
      if (guestToken) query.set("g", guestToken);
      const response = await fetch(`/api/team/meetings/${encodeURIComponent(code)}/agenda?${query}`, { cache: "no-store" }).catch(() => null);
      const payload = await response?.json().catch(() => null);
      if (active && response?.ok && Array.isArray(payload?.items)) setAgendaItems(payload.items);
    };
    void loadAgenda();
    const timer = window.setInterval(loadAgenda, 4_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [joined, code]);

  useEffect(() => {
    if (!code) return;
    setTranslation(loadCMeetTranslationPreferences(code));
    setTranslationReady(true);
  }, [code]);

  useEffect(() => {
    if (!translationReady || !code) return;
    saveCMeetTranslationPreferences(code, translation);
  }, [code, translation, translationReady]);

  useEffect(() => {
    if (!translationReady) return;
    clientRef.current?.updateSpokenLanguage(translation.spokenLanguage);
  }, [translation.spokenLanguage, translationReady]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Detect the local microphone level so the current speaker receives the
  // same visual voice waves as remote participants.
  useEffect(() => {
    if (!joined || !localStream || !micOn) {
      setLocalSpeaking(false);
      return;
    }
    const track = localStream.getAudioTracks().find((candidate) => candidate.readyState === "live");
    if (!track) return;
    const Context = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let disposed = false;
    const timer = window.setInterval(() => {
      if (disposed) return;
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        energy += normalized * normalized;
      }
      setLocalSpeaking(Math.sqrt(energy / samples.length) > 0.035);
    }, 120);
    void context.resume().catch(() => undefined);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      source.disconnect();
      void context.close().catch(() => undefined);
      setLocalSpeaking(false);
    };
  }, [joined, localStream, micOn]);

  // Signaling ends active peers almost immediately. This status check is a
  // durable fallback for a participant whose device was changing networks at
  // the exact moment the host ended the room.
  useEffect(() => {
    if (!joined || !code) return;
    let active = true;
    const checkRoom = async () => {
      const response = await fetch(`/api/cmeet/${encodeURIComponent(code)}`, { cache: "no-store" }).catch(() => null);
      const payload = await response?.json().catch(() => null);
      if (active && response?.ok && payload?.meeting) {
        setSupport(payload.support ?? null);
        if (payload.meeting.status === "ended") {
          await hangUp({ notice: "The host has ended this meeting.", exit: true });
          return;
        }
        if (typeof payload.meeting.audio_only === "boolean" && payload.meeting.audio_only !== meeting?.audio_only) {
          await applyMeetingMode(payload.meeting.audio_only);
        }
      }
    };
    const timer = window.setInterval(() => { void checkRoom(); }, 2_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [joined, code, meeting?.audio_only]);

  useEffect(() => {
    const video = pictureInPictureVideoRef.current;
    if (!video) return;
    video.srcObject = pictureInPictureStream;
    if (pictureInPictureStream) void video.play().catch(() => undefined);
  }, [pictureInPictureStream]);

  useEffect(() => {
    const video = pictureInPictureVideoRef.current;
    if (!video) return;
    const entered = () => setMinimized(true);
    const left = () => setMinimized(false);
    const webkitChanged = () => {
      const safariVideo = video as PictureInPictureVideo;
      setMinimized(safariVideo.webkitPresentationMode === "picture-in-picture");
    };
    video.addEventListener("enterpictureinpicture", entered);
    video.addEventListener("leavepictureinpicture", left);
    video.addEventListener("webkitpresentationmodechanged", webkitChanged);
    return () => {
      video.removeEventListener("enterpictureinpicture", entered);
      video.removeEventListener("leavepictureinpicture", left);
      video.removeEventListener("webkitpresentationmodechanged", webkitChanged);
    };
  }, []);

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
      hangUp({ notice: "The host has ended this stream.", exit: true });
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

  const remoteAudioSignature = useMemo(
    () => remotes
      // The spoken language is part of the signature: when someone changes the
      // language they speak, who needs translating changes with it.
      .map((peer) => `${peer.peerId}:${peer.stream.getAudioTracks()[0]?.id || "none"}:${peer.spokenLanguage || "auto"}`)
      .sort()
      .join("|"),
    [remotes],
  );

  useEffect(() => {
    translationRetryCountRef.current = 0;
  }, [code, joined, remoteAudioSignature, translation.enabled, translation.heardLanguage]);

  useEffect(() => {
    const listenerPeerId = peerIdRef.current;
    if (!joined || !translation.enabled || !code || !listenerPeerId) return;
    void warmCMeetTranslation({
      roomCode: code,
      listenerPeerId,
      targetLanguage: translation.heardLanguage,
    }).catch(() => setTranslationState("unavailable"));
  }, [code, joined, translation.enabled, translation.heardLanguage]);

  useEffect(() => {
    const sidecars = translationSidecarsRef.current;
    sidecars.forEach((sidecar) => sidecar.stop());
    sidecars.clear();
    setTranslatedCaptions({});

    const localPeerId = peerIdRef.current;
    if (!joined || !code || !localPeerId || !translation.enabled) {
      setTranslationState("off");
      setTranslatedPeerIds(new Set());
      return;
    }

    const speakers = remotesRef.current.filter((peer) => {
      const hasLiveAudio = peer.stream.getAudioTracks().some((track) => track.readyState === "live");
      if (!hasLiveAudio) return false;
      return true;
    });
    if (!speakers.length) {
      // Translation is enabled but no remote microphone is live yet. Keep the
      // listener in a settled state; the remote-track signature restarts this
      // effect as soon as somebody joins or unmutes a newly-added track.
      setTranslationState("live");
      setTranslatedPeerIds(new Set());
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    const livePeers = new Set<string>();
    const scheduleRetry = () => {
      if (cancelled || retryTimer !== null) return;
      setTranslationState("unavailable");
      const attempt = translationRetryCountRef.current;
      if (attempt >= 3) return;
      translationRetryCountRef.current = attempt + 1;
      const delay = [800, 1_800, 4_000][attempt] || 4_000;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        setTranslationRetryNonce((current) => current + 1);
      }, delay);
    };
    setTranslationState("connecting");
    const starts = speakers.map(async (peer) => {
      const sidecar = new CMeetTranslationSidecar({
        roomCode: code,
        listenerPeerId: localPeerId,
        sourceStream: peer.stream,
        targetLanguage: translation.heardLanguage,
        volume: translation.volume,
        onState: (state) => {
          if (cancelled) return;
          if (state === "unavailable") {
            livePeers.delete(peer.peerId);
            // Give this speaker's real voice straight back rather than leaving
            // the listener with a muted tile and nothing in its place.
            setTranslatedPeerIds(new Set(livePeers));
            scheduleRetry();
            return;
          }
          if (state === "live") {
            livePeers.add(peer.peerId);
            setTranslatedPeerIds(new Set(livePeers));
            if (livePeers.size === speakers.length) {
              translationRetryCountRef.current = 0;
              setTranslationState("live");
            }
          }
        },
        onTranscript: (text, final) => {
          if (cancelled) return;
          if (!text && !final) return;

          // A caption that is about to be cleared must not be cleared out from
          // under the sentence that follows it, so any pending timer is
          // cancelled the moment this speaker says something new.
          const pendingClear = captionClearTimersRef.current.get(peer.peerId);
          if (pendingClear !== undefined) {
            window.clearTimeout(pendingClear);
            captionClearTimersRef.current.delete(peer.peerId);
          }

          setTranslatedCaptions((current) => {
            const previous = current[peer.peerId];
            // Deltas continue the sentence in progress. Once an utterance is
            // done the next delta begins a new one from nothing.
            const base = previous && !previous.done ? previous.text : "";
            const merged = final ? (text || base) : `${base}${text}`;
            return { ...current, [peer.peerId]: { text: trimCaption(merged), done: final } };
          });

          if (final) {
            const timer = window.setTimeout(() => {
              captionClearTimersRef.current.delete(peer.peerId);
              setTranslatedCaptions((current) => {
                // Only clear if this speaker has not started talking again.
                if (!current[peer.peerId]?.done) return current;
                const next = { ...current };
                delete next[peer.peerId];
                return next;
              });
            }, 4_000);
            captionClearTimersRef.current.set(peer.peerId, timer);
          }
        },
      });
      sidecars.set(peer.peerId, sidecar);
      await sidecar.start();
    });

    void Promise.allSettled(starts).then((results) => {
      if (cancelled) return;
      if (results.some((result) => result.status === "rejected")) scheduleRetry();
    });

    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      // A caption waiting to clear itself has nothing left to clear once the
      // sidecars are gone, and would otherwise fire against the next session.
      captionClearTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      captionClearTimersRef.current.clear();
      sidecars.forEach((sidecar) => sidecar.stop());
      sidecars.clear();
      setTranslatedPeerIds(new Set());
    };
  }, [code, joined, remoteAudioSignature, translation.enabled, translation.heardLanguage, translationRetryNonce]);

  useEffect(() => {
    translationSidecarsRef.current.forEach((sidecar) => sidecar.setVolume(translation.volume));
  }, [translation.volume]);

  /* -------- Permissions & join -------- */
  const canJoinMeeting = Boolean(name.trim()) && !joining;

  async function joinMeeting() {
    if (!code || !name.trim() || !meeting || joining) return;
    // This must happen synchronously inside the click/key gesture so mobile
    // browsers permit the translated MediaStream to play when it arrives.
    primeCMeetTranslationPlayback();
    primeMeetingSounds();
    setJoining(true);
    setMediaError(null);

    let acquiredStream: MediaStream | null = null;
    try {
      const audio = true;
      const wantVideo = !meeting.audio_only;
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser cannot access camera or microphone devices.");
      }

      const peerId = peerIdForRoom(code);
      peerIdRef.current = peerId;
      // Admission and device permission do not depend on one another. Starting
      // them together removes the slower of the two from the critical path.
      const admissionPromise = requestAdmission(code, peerId, name);
      // Auto-admitted participants can fetch relay credentials while the
      // browser permission prompt is open. This removes another network trip
      // from the visible "Connecting…" stage without weakening admission.
      const earlyIcePromise = admissionPromise.then(async (earlyVerdict) => {
        if (earlyVerdict.status !== "admitted") return null;
        return fetchCMeetIceServers(code, peerId).catch((error) => {
          console.warn("[cMeet] TURN relay unavailable; trying a direct connection.", error);
          return [] as RTCIceServer[];
        });
      });

      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      const compactVideo = window.matchMedia("(max-width: 767px)").matches
        || connection?.saveData
        || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType || "");
      const speechAudioConstraints = buildCMeetSpeechAudioConstraints();
      const mediaConstraints: MediaStreamConstraints = {
        // Ask the browser DSP for the same treatment Meet relies on: echo
        // cancellation, noise suppression and auto gain. Mono at 48kHz is what
        // Opus wants anyway, and halves the audio we have to ship per peer.
        audio: audio && speechAudioConstraints,
        video: wantVideo
          ? {
              width: { ideal: compactVideo ? 640 : 960, max: compactVideo ? 854 : 1280 },
              height: { ideal: compactVideo ? 360 : 540, max: compactVideo ? 480 : 720 },
              frameRate: { ideal: compactVideo ? 20 : 24, max: compactVideo ? 20 : 24 },
              facingMode: "user",
            }
          : false,
      };
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      } catch (error) {
        // A missing/unsupported camera must not prevent an otherwise healthy
        // video meeting from continuing with audio. Permission denials still
        // surface to the user rather than being silently weakened.
        const mediaFailure = error instanceof DOMException || error instanceof Error ? error : null;
        if (wantVideo && ["NotFoundError", "OverconstrainedError", "ConstraintNotSatisfiedError"].includes(mediaFailure?.name || "")) {
          acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: mediaConstraints.audio, video: false });
          setCamOn(false);
          camOnRef.current = false;
        } else {
          throw error;
        }
      }
      const stream = acquiredStream;
      // Tell the encoder this is a talking head, not sport - it will drop
      // resolution before it drops frames, which reads as much smoother.
      stream.getVideoTracks().forEach((t) => { t.contentHint = "motion"; });
      stream.getAudioTracks().forEach((t) => { t.contentHint = "speech"; });

      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      if (!cameraTrackRef.current) {
        camOnRef.current = false;
        setCamOn(false);
      }
      setLocalStream(stream);

      // Ask to come in before any signaling happens. Staff and the client the
      // room was booked for are admitted immediately; anyone else waits here.
      const verdict = await admissionPromise;
      setCanAdmit(verdict.canAdmit);
      setMeetingRole(verdict.role === "host" ? "host" : verdict.role === "cohost" ? "co-host" : null);
      if (verdict.status !== "admitted") {
        setWaitingForHost(true);
        const decision = await new Promise<string>((resolve) => {
          const poll = window.setInterval(async () => {
            const status = await pollAdmission(code, peerId).catch(() => "waiting");
            if (status === "waiting") return;
            window.clearInterval(poll);
            resolve(status);
          }, 850);
          admissionPollRef.current = poll;
        });
        setWaitingForHost(false);
        if (decision !== "admitted") {
          forgetPeerId(code);
          setAdmissionDenied(true);
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
      }

      if (translation.enabled) {
        void warmCMeetTranslation({
          roomCode: code,
          listenerPeerId: peerId,
          targetLanguage: translation.heardLanguage,
        }).catch(() => undefined);
      }

      // Only admitted participants can exchange the private Cloudflare key for
      // short-lived relay credentials. If that service has a brief outage, a
      // direct STUN connection is still worth attempting.
      const earlyIceServers = await earlyIcePromise;
      const iceServers = earlyIceServers ?? await fetchCMeetIceServers(code, peerId).catch((error) => {
        console.warn("[cMeet] TURN relay unavailable; trying a direct connection.", error);
        return [] as RTCIceServer[];
      });

      const client = new CMeetClient(code, peerId, name, {
        onRemoteUpdate: (peers) => setRemotes([...peers]),
        onChat: (m) => {
          setChat((prev) => [...prev, m]);
          if (!m.self && m.body !== "__host_ended_stream__") playMeetingSound("message");
        },
        onError: (e) => console.error("[cMeet]", e),
        onActiveSpeaker: (id) => setActiveSpeaker(id),
        onPeerJoined: () => playMeetingSound("participant-joined"),
        onPeerLeft: () => playMeetingSound("participant-left"),
        onHandRaised: (_peerId, _peerName, raised) => {
          if (raised) playMeetingSound("hand-raised");
        },
        onHostMuteAll: () => {
          muteLocalByHost();
        },
        onHostMute: () => muteLocalByHost(),
        onHostModeChange: (audioOnly) => { void applyMeetingMode(audioOnly); },
        onHostEnd: () => { void hangUp({ notice: "The host has ended this meeting.", exit: true }); },
        onHostKicked: () => {
          forgetPeerId(code);
          void hangUp({ notice: "The host removed you from this meeting.", exit: true });
        },
      }, {
        memberId: me?.kind === "team" ? me.id : null,
        isOwner: verdict.canAdmit,
        hostRole: verdict.role === "host" ? "host" : verdict.role === "cohost" ? "co-host" : null,
        hostMemberId: meeting.created_by,
        hostIsOwner: true,
        spokenLanguage: translation.spokenLanguage,
        avatarUrl: me?.kind === "admin" ? "/favicon.png" : me?.avatar_url || null,
        participantKind: me?.kind || "guest",
      }, iceServers);
      clientRef.current = client;
      await client.join(stream);

      setHasLeft(false);
      setJoined(true);
      // Persist team presence so an incoming-call ringtone in another open
      // dashboard tab stops as soon as this member has actually joined.
      if (me?.kind === "team" && me.id) {
        void fetch(`/api/team/meetings/${encodeURIComponent(code)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "join" }),
        }).catch(() => undefined);
      }
    } catch (err: unknown) {
      console.error(err);
      acquiredStream?.getTracks().forEach((track) => track.stop());
      try { await clientRef.current?.leave(); } catch { /* best-effort cleanup */ }
      clientRef.current = null;
      localStreamRef.current = null;
      setLocalStream(null);
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

  // Hosts and creator co-hosts keep an eye on the lobby while in the room.
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
    micOnRef.current = next;
    setMicOn(next);
    clientRef.current?.updateMediaState(next, camOnRef.current);
  }

  async function toggleCam() {
    const currentStream = localStreamRef.current;
    if (!currentStream || meeting?.audio_only) return;
    const next = !camOnRef.current;
    let camera = cameraTrackRef.current;
    if (next && (!camera || camera.readyState !== "live")) {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot access a camera.");
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 960, max: 1280 },
          height: { ideal: 540, max: 720 },
          frameRate: { ideal: 24, max: 24 },
          facingMode: "user",
        },
      });
      camera = cameraStream.getVideoTracks()[0] || null;
      if (!camera) throw new Error("No camera was found.");
      camera.contentHint = "motion";
      cameraTrackRef.current = camera;
      await clientRef.current?.replaceVideoTrack(camera);
    }
    if (camera) camera.enabled = next;
    camOnRef.current = next;
    setCamOn(next);
    clientRef.current?.updateMediaState(micOnRef.current, next);
  }

  function muteLocalByHost() {
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
    micOnRef.current = false;
    setMicOn(false);
    clientRef.current?.updateMediaState(false, camOnRef.current);
    playMeetingSound("host-action");
  }

  async function applyMeetingMode(audioOnly: boolean) {
    if (sharingTrackRef.current && audioOnly) await stopScreenShare();
    const camera = cameraTrackRef.current;
    if (camera) {
      camera.enabled = false;
      await clientRef.current?.replaceVideoTrack(null);
      camera.stop();
      cameraTrackRef.current = null;
    }
    camOnRef.current = false;
    setCamOn(false);
    clientRef.current?.updateMediaState(micOnRef.current, false);
    setMeeting((value) => value ? { ...value, audio_only: audioOnly } : value);
  }

  async function switchMeetingMode() {
    if (!code || meetingRole !== "host" || !meeting) return;
    const audioOnly = !meeting.audio_only;
    const response = await fetch(`/api/cmeet/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ audioOnly }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not change the call mode.");
    await applyMeetingMode(audioOnly);
    clientRef.current?.hostSetMeetingMode(audioOnly);
    playMeetingSound("host-action");
  }

  async function stopScreenShare() {
    const client = clientRef.current;
    const sharedTrack = sharingTrackRef.current;
    if (!client || !sharedTrack) return;
    sharingTrackRef.current = null;
    sharedTrack.onended = null;
    try {
      await client.replaceScreenTrack(null, { sharing: false });
      sharedTrack.stop();
      setScreenStream(null);
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
    // Phones don't let an in-app web page capture the screen (no getDisplayMedia).
    if (inAppRef.current) {
      await appAlert("Screen sharing isn't available in the mobile app yet. Join this meeting from a computer to share your screen.");
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

      await client.replaceScreenTrack(shareTrack, { sharing: true });
      setScreenStream(new MediaStream([shareTrack]));
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
    if (meetingRole !== "host") {
      await appAlert("Only the meeting host can record this call.");
      return;
    }
    if (recorderRef.current?.state === "recording") return;
    if (typeof MediaRecorder === "undefined") {
      await appAlert("Call recording is not supported by this browser.");
      return;
    }
    const streams = [localStreamRef.current, ...remotes.map((peer) => peer.stream)].filter(Boolean) as MediaStream[];
    const output = new MediaStream();
    const featured = remoteSharing?.screenStream || (sharingTrackRef.current ? screenStream : remotes[0]?.stream) || localStreamRef.current;
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
        if (blob.size && inAppRef.current) {
          // The app's web view can't download; the app saves or shares the file.
          const extension = type.includes("mp4") ? (videoTrack ? "mp4" : "m4a") : "webm";
          void sendFileToApp(blob, `${fileSafeTitle(meeting?.title)}-${fileStamp()}.${extension}`, "recording");
        } else if (blob.size) {
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

  async function approveMeeting() {
    if (!code || approvalBusy) return;
    setApprovalBusy(true);
    try {
      const response = await fetch(`/api/cmeet/${encodeURIComponent(code)}/approval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The meeting could not be approved.");
      setMeeting(payload.meeting);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "The meeting could not be approved.");
    } finally {
      setApprovalBusy(false);
    }
  }

  async function toggleAgendaItem(item: AgendaItem) {
    if (!code || agendaBusyId) return;
    const completed = !item.completed_at;
    setAgendaBusyId(item.id);
    setAgendaItems((current) => current.map((entry) => entry.id === item.id
      ? { ...entry, completed_at: completed ? new Date().toISOString() : null }
      : entry));
    try {
      const response = await fetch(`/api/team/meetings/${encodeURIComponent(code)}/agenda`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          completed,
          peerId: peerIdRef.current,
          guestToken: guestTokenFromUrl(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The agenda could not be updated.");
    } catch (error) {
      setAgendaItems((current) => current.map((entry) => entry.id === item.id ? item : entry));
      await appAlert(error instanceof Error ? error.message : "The agenda could not be updated.");
    } finally {
      setAgendaBusyId(null);
    }
  }

  async function addAgendaItem(title: string) {
    const cleanTitle = title.trim();
    if (!code || meetingRole !== "host" || !cleanTitle || agendaAdding) return;
    setAgendaAdding(true);
    try {
      const response = await fetch(`/api/team/meetings/${encodeURIComponent(code)}/agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cleanTitle }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.item) {
        throw new Error(payload.error || "The agenda item could not be added.");
      }
      setAgendaItems((current) => [...current, payload.item]);
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "The agenda item could not be added.");
      throw error;
    } finally {
      setAgendaAdding(false);
    }
  }

  async function takeScreenScreenshot() {
    if (meetingRole !== "host") {
      await appAlert("Only the meeting host can take meeting screenshots.");
      return;
    }
    if (capturingScreenshot) return;
    // In the app there is no screen capture: capture the call itself (every
    // visible video tile) and let the app save it to Photos.
    if (inAppRef.current) {
      setCapturingScreenshot(true);
      try {
        const image = await captureCallImage();
        if (!image) {
          await appAlert("There is no video on screen to capture yet.");
          return;
        }
        await sendFileToApp(image, `${fileSafeTitle(meeting?.title)}-${fileStamp()}.jpg`, "screenshot");
      } finally {
        setCapturingScreenshot(false);
      }
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      await appAlert("Full-screen screenshots are not supported by this browser. Try cMeet in the latest Chrome, Edge, or Safari and use your device screenshot shortcut if needed.");
      return;
    }
    setCapturingScreenshot(true);
    let capture: MediaStream | null = null;
    try {
      capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = capture;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("The selected screen could not be captured."));
      });
      await video.play();
      await new Promise<void>((resolve) => {
        if ("requestVideoFrameCallback" in video) {
          video.requestVideoFrameCallback(() => resolve());
        } else {
          window.setTimeout(resolve, 120);
        }
      });
      const sourceWidth = video.videoWidth || 1280;
      const sourceHeight = video.videoHeight || 720;
      const scale = Math.min(1, 2560 / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sourceWidth * scale);
      canvas.height = Math.round(sourceHeight * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The screenshot could not be saved.");
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = meeting?.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "cmeet";
      anchor.href = objectUrl;
      anchor.download = `${safeTitle}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) {
        await appAlert(error instanceof Error ? error.message : "The screenshot could not be saved.");
      }
    } finally {
      capture?.getTracks().forEach((track) => track.stop());
      setCapturingScreenshot(false);
    }
  }

  async function hangUp(opts?: { notice?: string; exit?: boolean }) {
    await stopRecording();
    try { await clientRef.current?.leave(); } catch {}
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (cameraTrackRef.current) { try { cameraTrackRef.current.stop(); } catch {} }
    if (sharingTrackRef.current) { try { sharingTrackRef.current.stop(); } catch {} }
    const pipDocument = document as Document & { exitPictureInPicture?: () => Promise<void> };
    if (pipDocument.pictureInPictureElement && pipDocument.exitPictureInPicture) {
      await pipDocument.exitPictureInPicture().catch(() => undefined);
    }
    clientRef.current = null;
    localStreamRef.current = null;
    cameraTrackRef.current = null;
    sharingTrackRef.current = null;
    setScreenStream(null);
    setLocalStream(null);
    setRemotes([]);
    setWaitingGuests([]);
    setCanAdmit(false);
    setMeetingRole(null);
    setMicOn(true);
    setCamOn(!meeting?.audio_only);
    setSharing(false);
    setHandRaised(false);
    setShowMoreControls(false);
    setJoined(false);
    if (opts?.notice) appAlert(opts.notice);
    if (embeddedRef.current && postToEmbedHost({ type: "cmeet:close" })) {
      // The host (dashboard iframe or the mobile app) closes the room.
    } else if (opts?.exit) {
      router.push(exitPath);
    } else {
      setHasLeft(true);
    }
  }

  async function endStreamForEveryone() {
    if (!code) return;
    setEndingStream(true);
    try {
      await clientRef.current?.hostEnd();
      await fetch(`/api/cmeet/${code}`, { method: "DELETE" });
      await hangUp({ exit: true });
    } finally {
      setEndingStream(false);
    }
  }

  function requestControlAction(action: ConfirmableControlAction) {
    setPendingControlAction(action);
  }

  function requestMoreControlAction(action: ConfirmableControlAction) {
    setShowMoreControls(false);
    requestControlAction(action);
  }

  function toggleRaisedHand() {
    const raised = !handRaised;
    setHandRaised(raised);
    clientRef.current?.setHandRaised(raised);
    if (raised) playMeetingSound("hand-raised");
  }

  function muteEveryoneElse() {
    if (meetingRole !== "host") return;
    clientRef.current?.hostMuteAll();
    playMeetingSound("host-action");
    setShowMoreControls(false);
  }

  async function removeParticipant(peer: RemotePeer) {
    if (meetingRole !== "host") return;
    const confirmed = await appConfirm(`Remove ${peer.name} from this call?`);
    if (!confirmed) return;
    clientRef.current?.hostKick([peer.peerId]);
    playMeetingSound("host-action");
  }

  function muteParticipant(peer: RemotePeer) {
    if (meetingRole !== "host" || !peer.hasAudio) return;
    clientRef.current?.hostMuteParticipant(peer.peerId);
    playMeetingSound("host-action");
  }

  function toggleMeetingTheme() {
    setMeetingTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      try { window.localStorage.setItem("cmeet_theme", next); } catch { /* preference storage is optional */ }
      return next;
    });
  }

  async function restoreMeeting() {
    const pipDocument = document as Document & { exitPictureInPicture?: () => Promise<void> };
    const video = pictureInPictureVideoRef.current as PictureInPictureVideo | null;
    if (pipDocument.pictureInPictureElement && pipDocument.exitPictureInPicture) {
      await pipDocument.exitPictureInPicture().catch(() => undefined);
    } else if (video?.webkitPresentationMode === "picture-in-picture") {
      video.webkitSetPresentationMode?.("inline");
    }
    setMinimized(false);
  }

  async function minimizeMeeting() {
    // In the mobile app, the app shrinks the call to a floating pill and keeps
    // this page running untouched, so the room is exactly as it was on return.
    if (embeddedRef.current && inMobileApp()) {
      postToEmbedHost({ type: "cmeet:minimize" });
      return;
    }
    const video = pictureInPictureVideoRef.current as PictureInPictureVideo | null;
    if (video && pictureInPictureStream?.getVideoTracks().some((track) => track.readyState === "live")) {
      video.srcObject = pictureInPictureStream;
      await video.play().catch(() => undefined);
      const pipDocument = document as Document & { pictureInPictureEnabled?: boolean };
      try {
        if (pipDocument.pictureInPictureEnabled && video.requestPictureInPicture) {
          await video.requestPictureInPicture();
        } else if (video.webkitSupportsPresentationMode?.("picture-in-picture")) {
          video.webkitSetPresentationMode?.("picture-in-picture");
        }
      } catch {
        // The in-page compact card remains available when a browser blocks PiP.
      }
    }
    setMinimized(true);
    if (embeddedRef.current) postToEmbedHost({ type: "cmeet:minimize" });
  }

  /* -------- Derived: is the viewer host/admin? -------- */
  const canEndStream = !!meeting?.can_end_stream;
  const isHost = meetingRole === "host";
  const isSuperAdmin = me?.kind === "admin" && me.is_super_admin;
  const localRoleLabel = meetingRole ? ` · ${meetingRole}` : "";
  const participantTotal = remotes.length + 1;
  const microphonesOn = Number(micOn) + remotes.filter((peer) => peer.hasAudio).length;
  const camerasOn = Number(camOn) + remotes.filter((peer) => peer.hasVideo).length;

  /* -------- Derived: presenter + thumbnails -------- */
  const remoteSharing = useMemo(() => remotes.find((r) => r.isSharingScreen) || null, [remotes]);
  const presenter: "local" | { kind: "remote"; peer: RemotePeer } | null =
    sharing ? "local" : remoteSharing ? { kind: "remote", peer: remoteSharing } : null;
  const isDark = meetingTheme === "dark";
  const dotField = isDark
    ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Ccircle cx='18' cy='24' r='1' fill='%235A7FD4' fill-opacity='.38'/%3E%3Ccircle cx='91' cy='57' r='.7' fill='%23A8BDF0' fill-opacity='.3'/%3E%3Ccircle cx='151' cy='19' r='.8' fill='%234E71C2' fill-opacity='.28'/%3E%3Ccircle cx='42' cy='139' r='.8' fill='%237B9BE4' fill-opacity='.26'/%3E%3Ccircle cx='139' cy='119' r='1' fill='%235A7FD4' fill-opacity='.32'/%3E%3C/svg%3E")`
    : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Ccircle cx='18' cy='24' r='1' fill='%230A4FE8' fill-opacity='.12'/%3E%3Ccircle cx='91' cy='57' r='.7' fill='%230D1B39' fill-opacity='.1'/%3E%3Ccircle cx='151' cy='19' r='.8' fill='%230A4FE8' fill-opacity='.09'/%3E%3Ccircle cx='42' cy='139' r='.8' fill='%230A4FE8' fill-opacity='.1'/%3E%3Ccircle cx='139' cy='119' r='1' fill='%230D1B39' fill-opacity='.08'/%3E%3C/svg%3E")`;

  /* ---------------------------------------------------------------- */
  if (!code) return null;
  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A1130] text-white">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (meeting.approval_status === "pending" || meeting.status === "pending_approval") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0A1130] p-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F1A4A] p-6 text-center shadow-2xl">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#0A4FE8]"><Clock className="h-5 w-5" /></div>
          <p className="mt-4 text-[11px] text-[#8DAAFF]">cMeet</p>
          <h1 className="mt-1 text-xl font-semibold">Waiting for admin approval</h1>
          <p className="mt-2 text-sm leading-6 text-white/60">“{meeting.title}” is ready. Camera, microphone, signaling, and invite access will remain closed until an admin approves it.</p>
          {meeting.can_approve ? (
            <button type="button" onClick={() => void approveMeeting()} disabled={approvalBusy} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-semibold disabled:opacity-60">
              {approvalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Approve and open meeting
            </button>
          ) : <p className="mt-5 text-xs text-white/40">This page will update automatically after approval.</p>}
          <button type="button" onClick={() => router.push(exitPath)} className="mt-2 h-10 w-full rounded-xl text-xs font-medium text-white/60 hover:bg-white/5 hover:text-white">Return to cMeet</button>
        </div>
      </div>
    );
  }

  if (meeting.approval_status === "rejected" || meeting.status === "cancelled") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0A1130] p-4 text-white">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0F1A4A] p-6 text-center">
          <h1 className="text-lg font-semibold">Meeting unavailable</h1>
          <p className="mt-2 text-sm text-white/60">This cMeet request was declined or cancelled.</p>
          <button type="button" onClick={() => router.push(exitPath)} className="mt-5 h-10 w-full rounded-xl bg-white/10 text-sm font-medium">Return</button>
        </div>
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

  /* -------- Left voluntarily: keep the room available for rejoin -------- */
  if (hasLeft && !joined) {
    return (
      <div className="min-h-screen bg-[#0A1130] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0F1A4A] p-6 text-center">
          <p className="text-[11px] text-[#6B92FF]">cMeet</p>
          <h1 className="mt-1 text-[20px] font-bold">{meeting.title}</h1>
          <p className="mt-4 text-sm text-white/60">You left the meeting. You can rejoin while the host keeps it open.</p>
          <button
            type="button"
            onClick={() => { setHasLeft(false); setMediaError(null); void joinMeeting(); }}
            disabled={joining}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4FE8] text-sm font-semibold text-white disabled:opacity-50"
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {joining ? "Reconnecting…" : "Rejoin meeting"}
          </button>
          <button
            type="button"
            onClick={() => router.push(exitPath)}
            className="mt-2 h-10 w-full rounded-xl text-xs font-medium text-white/60 hover:bg-white/5 hover:text-white"
          >
            {exitPath === "/login" ? "Go to client login" : "Return to cMeet"}
          </button>
        </div>
      </div>
    );
  }

  /* -------- Join screen -------- */
  if (!joined) {
    return (
      <div style={{ backgroundImage: dotField }} className={`flex min-h-screen items-center justify-center p-4 ${isDark ? "bg-[#07122E] text-white" : "bg-[#F4F7FC] text-[#0D1B39]"}`}>
        <div className={`relative w-full max-w-sm rounded-2xl border p-6 shadow-xl ${isDark ? "border-white/10 bg-[#0F1A4A]" : "border-[#DDE5F2] bg-white"}`}>
          <button type="button" onClick={toggleMeetingTheme} className={`absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border ${isDark ? "border-white/10 bg-white/[0.06] text-amber-200" : "border-[#DDE5F2] bg-white text-slate-600"}`} aria-label={`Use ${isDark ? "light" : "dark"} mode`}>{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          <p className="text-[11px] text-[#0A4FE8]">cMeet</p>
          <h1 className="mb-5 mt-1 text-[20px] font-bold">{meeting.title}</h1>
          <div className={`mb-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${isDark ? "bg-emerald-400/10 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`} title="Media travels over WebRTC using DTLS-SRTP encryption. Live translation is processed only when you enable it.">
            <LockKeyhole className="h-3 w-3" /> Encrypted WebRTC media
          </div>
          <label className={`mb-1.5 block text-[11px] ${isDark ? "text-white/60" : "text-slate-600"}`}>Your name</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (mediaError) setMediaError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && canJoinMeeting && joinMeeting()}
            placeholder="Alex Doe"
            className={`w-full rounded-xl border px-3 py-2.5 text-[13px] focus:outline-none focus:border-[#0A4FE8] ${isDark ? "border-white/10 bg-white/5 text-white" : "border-[#DDE5F2] bg-[#F8FAFD] text-[#0D1B39]"}`}
          />
          {mediaError && (
            <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
              {mediaError}
            </div>
          )}
          <div className={`mt-4 rounded-xl border p-3 ${isDark ? "border-white/10 bg-white/[0.03]" : "border-[#DDE5F2] bg-[#F8FAFD]"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className={`flex items-center gap-2 text-xs font-medium ${isDark ? "text-white/75" : "text-slate-700"}`}>
                <Languages className="h-3.5 w-3.5 text-[#0A4FE8]" /> Live translation
              </div>
              <input
                type="checkbox"
                checked={translation.enabled}
                onChange={(event) => {
                  if (event.target.checked) primeCMeetTranslationPlayback();
                  setTranslation((current) => ({ ...current, enabled: event.target.checked }));
                }}
                className="h-4 w-4 accent-[#0A4FE8]"
                aria-label="Enable live translation"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className={`text-[10px] leading-4 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                Language I speak
                <select
                  value={translation.spokenLanguage}
                  onChange={(event) => setTranslation((current) => ({ ...current, spokenLanguage: event.target.value as CMeetTranslationPreferences["spokenLanguage"] }))}
                  className={`mt-1 h-9 w-full rounded-lg border px-2 text-[11px] outline-none ${isDark ? "border-white/10 bg-[#0A1130] text-white" : "border-[#DDE5F2] bg-white text-[#0D1B39]"}`}
                >
                  {CMEET_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
                </select>
              </label>
              <label className={`text-[10px] leading-4 ${isDark ? "text-white/50" : "text-slate-500"}`}>
                Language I want to hear
                <select
                  value={translation.heardLanguage}
                  onChange={(event) => setTranslation((current) => ({ ...current, heardLanguage: event.target.value as CMeetTranslationPreferences["heardLanguage"] }))}
                  className={`mt-1 h-9 w-full rounded-lg border px-2 text-[11px] outline-none ${isDark ? "border-white/10 bg-[#0A1130] text-white" : "border-[#DDE5F2] bg-white text-[#0D1B39]"}`}
                >
                  {CMEET_LANGUAGES.filter((language) => language.code !== "auto").map((language) => (
                    <option key={language.code} value={language.code}>{language.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
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
    <div data-cmeet-theme={meetingTheme} style={{ backgroundImage: dotField }} className={`relative flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden ${isDark ? "bg-[#07122E] text-white" : "bg-[#F4F7FC] text-[#0D1B39]"}`}>
      <header className={`relative z-10 flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-5 ${isDark ? "border-white/10 bg-[#0A1130]/90" : "border-[#DDE5F2] bg-white/90"}`}>
        <div className="flex-1 min-w-0">
          <h1 className="text-[14px] font-bold truncate">{meeting.title}</h1>
          <p className="text-[10.5px] text-[#0A4FE8]">cMeet</p>
        </div>
        <div className="relative">
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={() => setShowParticipantList((current) => !current)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-medium ${isDark ? "border-white/10 bg-white/[0.06] text-white/70" : "border-[#DDE5F2] bg-white text-slate-600"}`}
              aria-expanded={showParticipantList}
              aria-label="Show participant list"
            >
              <Users className="h-3.5 w-3.5" /> {remotes.length + 1}
            </button>
          ) : (
            <div className={`inline-flex items-center gap-1.5 text-[11px] ${isDark ? "text-white/60" : "text-slate-500"}`} aria-label={`${remotes.length + 1} participants`}>
              <Users className="h-3.5 w-3.5" /> {remotes.length + 1}
            </div>
          )}
          {isSuperAdmin && showParticipantList && (
            <ParticipantListDropdown
              localName={name}
              localAvatarUrl={me?.avatar_url || "/favicon.png"}
              localHasAudio={micOn}
              localHasVideo={camOn}
              remotes={remotes}
              onMute={muteParticipant}
              onRemove={(peer) => void removeParticipant(peer)}
              onClose={() => setShowParticipantList(false)}
            />
          )}
        </div>
        <div className={`flex items-center gap-1 ${isDark ? "text-white/65" : "text-slate-600"}`} aria-label={`${microphonesOn} of ${participantTotal} microphones on${meeting.audio_only ? "" : `, ${camerasOn} of ${participantTotal} cameras on`}`}>
          <span className={`inline-flex h-8 items-center gap-1 rounded-xl border px-1.5 text-[10px] sm:px-2 ${isDark ? "border-white/10 bg-white/[0.06]" : "border-[#DDE5F2] bg-white"}`} title={`${microphonesOn} of ${participantTotal} microphones on`}>
            <Mic className="h-3.5 w-3.5" /> {microphonesOn}/{participantTotal}
          </span>
          {!meeting.audio_only && (
            <span className={`inline-flex h-8 items-center gap-1 rounded-xl border px-1.5 text-[10px] sm:px-2 ${isDark ? "border-white/10 bg-white/[0.06]" : "border-[#DDE5F2] bg-white"}`} title={`${camerasOn} of ${participantTotal} cameras on`}>
              <Video className="h-3.5 w-3.5" /> {camerasOn}/{participantTotal}
            </span>
          )}
        </div>
        <div className={`hidden items-center gap-1 rounded-full px-2 py-1 text-[10px] sm:inline-flex ${isDark ? "bg-emerald-400/10 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`} title="DTLS-SRTP encrypted WebRTC media">
          <LockKeyhole className="h-3 w-3" /> Encrypted
        </div>
        <button type="button" onClick={toggleMeetingTheme} className={`grid h-9 w-9 place-items-center rounded-xl border ${isDark ? "border-white/10 bg-white/[0.06] text-amber-200" : "border-[#DDE5F2] bg-white text-slate-600"}`} aria-label={`Use ${isDark ? "light" : "dark"} mode`} title={`Use ${isDark ? "light" : "dark"} mode`}>
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => void (minimized ? restoreMeeting() : minimizeMeeting())} className={`grid h-9 w-9 place-items-center rounded-xl border ${isDark ? "border-white/10 bg-white/[0.06] text-white/70" : "border-[#DDE5F2] bg-white text-slate-600"}`} aria-label={minimized ? "Restore meeting" : "Open floating meeting window"} title={minimized ? "Restore meeting" : "Keep meeting visible in a floating window"}>
          {minimized ? <Maximize2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
        </button>
      </header>

      <video
        ref={pictureInPictureVideoRef}
        autoPlay
        playsInline
        muted
        aria-hidden
        className="pointer-events-none absolute h-px w-px opacity-0"
      />

      {/* Mounted once per peer for the whole call - see RemoteAudio. */}
      {/* Muted per speaker, and only once their translated speech is actually
          arriving. Muting on the preference alone meant a session that was
          still connecting, or that failed outright, left the listener in total
          silence with the real voices switched off and nothing in their place. */}
      <RemoteAudio peers={remotes} translatedPeerIds={translatedPeerIds} />

      {minimized && (
        <div className="relative z-10 flex min-h-0 flex-1 items-end justify-end p-3 sm:p-5">
          <section aria-label="Minimized cMeet call" className={`w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl ${isDark ? "border-[#31518D] bg-[#0A1130]" : "border-[#D7E1F0] bg-white"}`}>
            <div className="relative aspect-video bg-[#071225]">
              {meeting.audio_only || !localStream?.getVideoTracks().length ? (
                <div className="grid h-full place-items-center">
                  <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border-2 border-[#5B8CFF] bg-[#0A4FE8] text-xl font-semibold text-white shadow-lg">
                    {me?.avatar_url
                      ? <img src={me.kind === "admin" ? "/favicon.png" : me.avatar_url} alt="" className="h-full w-full object-cover" />
                      : participantInitials(name)}
                  </div>
                </div>
              ) : <VideoTile stream={localStream} muted objectFit="cover" />}
              <div className="absolute bottom-2 left-2 rounded-lg bg-black/70 px-2 py-1 text-[10px] font-medium text-white">Live · {remotes.length + 1} participants</div>
            </div>
            <div className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{meeting.title}</p><p className={`text-[11px] ${isDark ? "text-white/50" : "text-slate-500"}`}>Meeting continues in the background</p></div>
              <Link href={exitPath} target="_blank" rel="noopener noreferrer" className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-semibold ${isDark ? "border-white/10 bg-white/5 text-white" : "border-[#DDE5F2] text-[#0D1B39]"}`}>Continue working</Link>
              <button type="button" onClick={() => void restoreMeeting()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0A4FE8] px-3 text-xs font-semibold text-white"><Maximize2 className="h-3.5 w-3.5" />Restore</button>
            </div>
          </section>
        </div>
      )}

      {/* Lobby. Only a host or creator co-host receives entries here. */}
      {canAdmit && waitingGuests.length > 0 && (
        <ViewportPortal>
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto overscroll-contain p-3 sm:p-4">
        <div role="dialog" aria-label="People waiting to join" className="pointer-events-auto my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#0F1A4A] p-3 text-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
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
        </div>
        </ViewportPortal>
      )}

      {!minimized && (
      <main className="relative flex min-h-0 flex-1 overflow-hidden pb-[72px]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-3">
          {/* A client who called support is told what is happening, rather
              than being left with a ringtone and no answer. */}
          {support?.rescheduledFor && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-[#07133B]">
              <p className="font-semibold">Your call has been rescheduled.</p>
              <p className="mt-0.5 text-[12px] leading-5 text-[#475467]">
                The team has offered {new Date(support.rescheduledFor).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}.
                It is in your dashboard under cMeet.
              </p>
            </div>
          )}
          {!support?.rescheduledFor && support?.unavailable && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              <p className="font-semibold">Support team currently unavailable</p>
              <p className="mt-0.5 text-[12px] leading-5 text-amber-900/80">
                Nobody was free to take this call. Send a message in chat and the team will come back to you, or try again shortly.
              </p>
            </div>
          )}
          {!support?.unavailable && support?.passedTo && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-[#07133B]">
              <p className="font-semibold">Your call is being passed to {support.passedTo}.</p>
              <p className="mt-0.5 text-[12px] leading-5 text-[#475467]">Stay on the line, they are joining now.</p>
            </div>
          )}
          {meeting.audio_only ? (
            <AudioParticipantGrid
              local={{
                name,
                label: `${name} (you)${localRoleLabel}`,
                avatarUrl: me?.kind === "admin" ? "/favicon.png" : me?.avatar_url || null,
                participantKind: me?.kind || "guest",
                handRaised,
                hasAudio: micOn,
                hasVideo: camOn,
              }}
              remotes={remotes}
              activeSpeaker={activeSpeaker}
              localSpeaking={localSpeaking}
              captions={translation.captions ? translatedCaptions : {}}
              translationEnabled={translation.enabled}
              onMute={isHost ? muteParticipant : undefined}
              onRemove={isHost ? (peer) => void removeParticipant(peer) : undefined}
            />
          ) : presenter ? (
            <>
              {/* Presentation stage: always 16:9, letterboxed when needed. */}
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                <div className="relative aspect-video w-full max-h-full overflow-hidden rounded-2xl border border-white/10 bg-black">
                  {presenter === "local" ? (
                    <VideoTile key={screenStream?.id || "local-screen"} stream={screenStream} muted objectFit="contain" />
                  ) : (
                    <VideoTile key={presenter.peer.screenStream.id} stream={presenter.peer.screenStream} muted objectFit="contain" />
                  )}
                  <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#071225]/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm">
                    <ScreenShare className="w-3 h-3" />
                    {presenter === "local" ? `${name} (you) · presenting` : `${presenter.peer.name} · presenting`}
                  </div>
                  {presenter !== "local" && translation.enabled && translation.captions && translatedCaptions[presenter.peer.peerId]?.text && (
                    <ParticipantCaption text={translatedCaptions[presenter.peer.peerId].text} />
                  )}
                </div>
              </div>

              {/* Participant strip */}
              <div className="shrink-0 flex gap-2 overflow-x-auto pb-1">
                <ParticipantTile
                  key="local-thumb"
                  stream={localStream}
                  label={`${name} (you)${localRoleLabel}`}
                  muted
                  showVideoOff={!camOn}
                  hasAudio={micOn}
                  hasVideo={camOn}
                  speaking={localSpeaking}
                  handRaised={handRaised}
                  language={translation.enabled ? `${languageBadge(translation.spokenLanguage)} → ${languageBadge(translation.heardLanguage)}` : undefined}
                />
                {remotes
                  .map((p) => (
                    <ParticipantTile
                      key={p.peerId}
                      stream={p.stream}
                      label={`${p.name}${p.hostRole ? ` · ${p.hostRole}` : p.isHost ? " · host" : ""}`}
                      showVideoOff={!p.hasVideo}
                      hasAudio={p.hasAudio}
                      hasVideo={p.hasVideo}
                      speaking={activeSpeaker === p.peerId}
                      quality={p.quality}
                      handRaised={p.handRaised}
                      onMute={isHost && p.hasAudio ? () => muteParticipant(p) : undefined}
                      onRemove={isHost ? () => void removeParticipant(p) : undefined}
                      caption={translation.enabled && translation.captions ? translatedCaptions[p.peerId]?.text : undefined}
                      language={translation.enabled ? `${languageBadge(p.spokenLanguage)} → ${languageBadge(translation.heardLanguage)}` : undefined}
                    />
                  ))}
              </div>
            </>
          ) : (
            /* Grid */
            <AdaptiveParticipantGrid
              local={{
                stream: localStream,
                label: `${name} (you)${localRoleLabel}`,
                showVideoOff: !camOn,
                hasAudio: micOn,
                hasVideo: camOn,
                language: translation.enabled ? `${languageBadge(translation.spokenLanguage)} → ${languageBadge(translation.heardLanguage)}` : "",
              }}
              remotes={remotes}
              activeSpeaker={activeSpeaker}
              localSpeaking={localSpeaking}
              captions={translation.captions ? translatedCaptions : {}}
              translationEnabled={translation.enabled}
              targetLanguage={translation.heardLanguage}
              localHandRaised={handRaised}
              onShowAll={isSuperAdmin ? () => setShowParticipantList(true) : undefined}
              onMute={isHost ? muteParticipant : undefined}
              onRemove={isHost ? (peer) => void removeParticipant(peer) : undefined}
            />
          )}
        </div>

        {showChat && (
          <aside className="absolute inset-x-0 bottom-[72px] top-0 z-30 flex min-h-0 min-w-0 w-full flex-col overflow-hidden border-l border-white/10 bg-[#0A1130] text-white sm:relative sm:inset-auto sm:z-auto sm:w-[340px] sm:shrink-0">
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
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="shrink-0 p-2 rounded-lg hover:bg-white/5 text-white/60" aria-label="Choose an emoji">
                  <Smile className="w-4 h-4" />
                </button>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())}
                  placeholder="Message the call…"
                  className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[12.5px] focus:outline-none focus:border-white/20"
                />
                <button type="button" onClick={sendChat} disabled={!chatInput.trim()} className="shrink-0 p-2 rounded-lg bg-[#0A4FE8] disabled:opacity-50" aria-label="Send message">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>
        )}
      </main>
      )}

      <footer className={`${minimized ? "hidden" : "fixed inset-x-0 bottom-0 z-50 min-h-[68px] border-t px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.14)] backdrop-blur-md md:px-5"} ${isDark ? "border-white/10 bg-[#0A1130]/95" : "border-[#DDE5F2] bg-white/95"}`}>
        <div className="grid w-full grid-cols-5 gap-2 sm:hidden">
          <ControlButton dark={isDark} onClick={() => requestControlAction({ title: micOn ? "Mute microphone?" : "Unmute microphone?", description: micOn ? "Other participants will stop hearing your microphone until you turn it back on." : "Other participants will be able to hear your microphone again.", confirmLabel: micOn ? "Mute" : "Unmute", run: toggleMic })} active={!micOn} icon={micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />} title={micOn ? "Mute" : "Unmute"} />
          {!meeting.audio_only ? (
            <ControlButton dark={isDark} onClick={() => requestControlAction({ title: camOn ? "Turn camera off?" : "Turn camera on?", description: camOn ? "Your video will be hidden while your audio continues." : "Other participants will be able to see your camera feed.", confirmLabel: camOn ? "Turn off" : "Turn on", run: toggleCam })} active={!camOn} icon={camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />} title={camOn ? "Turn camera off" : "Turn camera on"} />
          ) : (
            <ControlButton dark={isDark} onClick={() => setShowAgenda(true)} active={showAgenda} icon={<ListChecks className="h-4 w-4" />} title="Meeting agenda" />
          )}
          <ControlButton dark={isDark} onClick={() => setShowChat(!showChat)} active={showChat} icon={<MessageCircle className="h-4 w-4" />} title="Chat" />
          <ControlButton dark={isDark} onClick={toggleRaisedHand} active={handRaised} icon={<Hand className="h-4 w-4" />} title={handRaised ? "Lower hand" : "Raise hand"} />
          <button
            type="button"
            onClick={() => setShowMoreControls(true)}
            className={`flex h-11 min-w-0 flex-col items-center justify-center rounded-xl text-[9px] font-medium transition ${isDark ? "bg-white/10 text-white hover:bg-white/20" : "border border-[#DDE5F2] bg-white text-[#0D1B39] hover:border-blue-200 hover:text-[#0A4FE8]"}`}
            aria-label="More meeting controls"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span>More</span>
          </button>
        </div>

        <div className="hidden items-center justify-center gap-2 sm:flex">
        <ControlButton dark={isDark} onClick={() => requestControlAction({ title: micOn ? "Mute microphone?" : "Unmute microphone?", description: micOn ? "Other participants will stop hearing your microphone until you turn it back on." : "Other participants will be able to hear your microphone again.", confirmLabel: micOn ? "Mute" : "Unmute", run: toggleMic })} active={!micOn} icon={micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />} title={micOn ? "Mute" : "Unmute"} />
        {!meeting.audio_only && (
          <ControlButton dark={isDark} onClick={() => requestControlAction({ title: camOn ? "Turn camera off?" : "Turn camera on?", description: camOn ? "Your video will be hidden while your audio continues." : "Other participants will be able to see your camera feed.", confirmLabel: camOn ? "Turn off" : "Turn on", run: toggleCam })} active={!camOn} icon={camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />} title={camOn ? "Turn camera off" : "Turn camera on"} />
        )}
        {!meeting.audio_only && (
          <ControlButton dark={isDark} onClick={() => requestControlAction({ title: sharing ? "Stop sharing your screen?" : "Share your screen?", description: sharing ? "Participants will return to your camera view." : inApp ? "Screen sharing isn't available in the mobile app yet. Join this meeting from a computer to share your screen." : "Your browser will ask which screen or window you want everyone to see.", confirmLabel: sharing ? "Stop sharing" : inApp ? "OK" : "Choose a screen", run: inApp && !sharing ? async () => undefined : toggleShare })} active={sharing} icon={sharing ? <ScreenShareOff className="w-4 h-4" /> : <ScreenShare className="w-4 h-4" />} title={sharing ? "Stop sharing" : "Share your screen"} />
        )}
        <ControlButton dark={isDark} onClick={() => requestControlAction({ title: showChat ? "Close meeting chat?" : "Open meeting chat?", description: "The in-call chat lets you exchange short messages without interrupting the speaker.", confirmLabel: showChat ? "Close chat" : "Open chat", run: () => setShowChat(!showChat) })} active={showChat} icon={<MessageCircle className="w-4 h-4" />} title="Chat" />
        <ControlButton dark={isDark} onClick={() => requestControlAction({ title: "Open meeting agenda?", description: "View the planned discussion items and mark each one as discussed.", confirmLabel: "Open agenda", run: () => setShowAgenda(true) })} active={showAgenda} icon={<ListChecks className="h-4 w-4" />} title="Meeting agenda" />
        <ControlButton
          dark={isDark}
          onClick={() => setShowTranslation(true)}
          active={translation.enabled}
          icon={<Languages className="h-4 w-4" />}
          title="Live translation"
        />
        <ControlButton dark={isDark} onClick={toggleRaisedHand} active={handRaised} icon={<Hand className="h-4 w-4" />} title={handRaised ? "Lower hand" : "Raise hand"} />
        {isHost && <ControlButton dark={isDark} onClick={() => requestControlAction({ title: meeting.audio_only ? "Switch this room to video?" : "Switch this room to audio?", description: meeting.audio_only ? "Video mode will open for everyone with every camera off. Each participant can choose when to turn their camera on." : "Every participant camera and active screen share will stop when the room changes to audio mode.", confirmLabel: meeting.audio_only ? "Switch to video" : "Switch to audio", run: switchMeetingMode })} active={false} icon={meeting.audio_only ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />} title={meeting.audio_only ? "Switch to video call" : "Switch to audio call"} />}
        {isHost && <ControlButton dark={isDark} onClick={muteEveryoneElse} active={false} icon={<VolumeX className="h-4 w-4" />} title="Mute everyone else" />}
        {isHost && <ControlButton dark={isDark} onClick={() => requestControlAction({ title: recording ? "Stop and save recording?" : "Record this meeting?", description: recording ? (inApp ? "The recording will stop, and you can save it to your phone or share it." : "The recording will stop and download to this device.") : (inApp ? "The call will be recorded on this phone. When you stop, you can save or share the recording." : "A local recording will be created in this browser and downloaded when you stop it."), confirmLabel: recording ? "Stop and save" : "Start recording", run: () => recording ? stopRecording() : startRecording() })} active={recording} icon={recording ? <CircleStop className="h-4 w-4" /> : <Circle className="h-4 w-4" />} title={recording ? "Stop and save recording" : "Record this call to your device"} />}
        {isHost && <ControlButton dark={isDark} onClick={() => requestControlAction({ title: "Take a screenshot?", description: inApp ? "A picture of everyone's video in this call will be saved to your Photos." : "Your browser will ask which screen to capture, then save the screenshot to your device.", confirmLabel: inApp ? "Take screenshot" : "Choose a screen", run: takeScreenScreenshot })} active={capturingScreenshot} icon={capturingScreenshot ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} title="Screenshot entire screen" />}
        <UniversalShareButton
          title={meeting.title}
          text={`Join the live meeting "${meeting.title}" on CDS Space cMeet.`}
          url={buildCMeetPath(code, meeting.title)}
          label=""
          className={`h-11 min-h-11 w-full rounded-xl p-0 shadow-none sm:h-9 sm:min-h-9 sm:w-9 sm:rounded-full ${isDark ? "border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10" : "border-[#DDE5F2] bg-white text-[#0D1B39] hover:border-blue-200 hover:text-[#0A4FE8]"}`}
        />
        {canEndStream && (
          <button
            onClick={() => setShowEndConfirm(true)}
            aria-label="End stream for everyone"
            className="inline-flex h-11 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-rose-700 px-3 text-[12.5px] font-semibold text-white hover:bg-rose-800 sm:ml-2 sm:h-10 sm:w-auto sm:rounded-full sm:px-4"
            title="End stream for everyone"
          >
            <CircleStop className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">End stream</span>
          </button>
        )}
        <button
          onClick={() => requestControlAction({ title: "Leave this meeting?", description: "Your camera, microphone, translation and meeting connections will close. You can rejoin while the meeting remains open.", confirmLabel: "Leave meeting", tone: "danger", run: () => hangUp() })}
          aria-label="Leave meeting"
          title="Leave meeting"
          className="inline-flex h-11 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-rose-600 px-3 text-[12.5px] font-semibold text-white sm:ml-2 sm:h-10 sm:w-auto sm:rounded-full sm:px-4"
        >
          <PhoneOff className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Leave</span>
        </button>
        </div>
      </footer>

      <ViewportPortal>
        {showMoreControls && (
          <MoreControlsModal onClose={() => setShowMoreControls(false)}>
            <MoreControlButton icon={micOn ? <Mic /> : <MicOff />} label={micOn ? "Mute" : "Unmute"} active={!micOn} onClick={() => requestMoreControlAction({ title: micOn ? "Mute microphone?" : "Unmute microphone?", description: micOn ? "Other participants will stop hearing your microphone until you turn it back on." : "Other participants will be able to hear your microphone again.", confirmLabel: micOn ? "Mute" : "Unmute", run: toggleMic })} />
            {!meeting.audio_only && <MoreControlButton icon={camOn ? <Video /> : <VideoOff />} label={camOn ? "Camera off" : "Camera on"} active={!camOn} onClick={() => requestMoreControlAction({ title: camOn ? "Turn camera off?" : "Turn camera on?", description: camOn ? "Your video will be hidden while your audio continues." : "Other participants will be able to see your camera feed.", confirmLabel: camOn ? "Turn off" : "Turn on", run: toggleCam })} />}
            {!meeting.audio_only && <MoreControlButton icon={sharing ? <ScreenShareOff /> : <ScreenShare />} label={sharing ? "Stop sharing" : "Share screen"} active={sharing} onClick={() => requestMoreControlAction({ title: sharing ? "Stop sharing your screen?" : "Share your screen?", description: sharing ? "Participants will return to your camera view." : inApp ? "Screen sharing isn't available in the mobile app yet. Join this meeting from a computer to share your screen." : "Your browser will ask which screen or window you want everyone to see.", confirmLabel: sharing ? "Stop sharing" : inApp ? "OK" : "Choose a screen", run: inApp && !sharing ? async () => undefined : toggleShare })} />}
            <MoreControlButton icon={<MessageCircle />} label="Chat" active={showChat} onClick={() => { setShowChat(!showChat); setShowMoreControls(false); }} />
            <MoreControlButton icon={<ListChecks />} label="Agenda" active={showAgenda} onClick={() => { setShowAgenda(true); setShowMoreControls(false); }} />
            <MoreControlButton icon={<Languages />} label="Live translation" active={translation.enabled} onClick={() => { setShowTranslation(true); setShowMoreControls(false); }} />
            <MoreControlButton icon={<Hand />} label={handRaised ? "Lower hand" : "Raise hand"} active={handRaised} onClick={() => { toggleRaisedHand(); setShowMoreControls(false); }} />
            {isSuperAdmin && <MoreControlButton icon={<Users />} label="Participants" active={showParticipantList} onClick={() => { setShowParticipantList(true); setShowMoreControls(false); }} />}
            {isHost && <MoreControlButton icon={meeting.audio_only ? <Video /> : <Mic />} label={meeting.audio_only ? "Switch to video" : "Switch to audio"} onClick={() => requestMoreControlAction({ title: meeting.audio_only ? "Switch this room to video?" : "Switch this room to audio?", description: meeting.audio_only ? "Video mode will open for everyone with every camera off. Each participant can choose when to turn their camera on." : "Every participant camera and active screen share will stop when the room changes to audio mode.", confirmLabel: meeting.audio_only ? "Switch to video" : "Switch to audio", run: switchMeetingMode })} />}
            {isHost && <MoreControlButton icon={<VolumeX />} label="Mute everyone" onClick={muteEveryoneElse} />}
            {isHost && <MoreControlButton icon={recording ? <CircleStop /> : <Circle />} label={recording ? "Stop recording" : "Record call"} active={recording} onClick={() => requestMoreControlAction({ title: recording ? "Stop and save recording?" : "Record this meeting?", description: recording ? (inApp ? "The recording will stop, and you can save it to your phone or share it." : "The recording will stop and download to this device.") : (inApp ? "The call will be recorded on this phone. When you stop, you can save or share the recording." : "A local recording will be created in this browser and downloaded when you stop it."), confirmLabel: recording ? "Stop and save" : "Start recording", run: () => recording ? stopRecording() : startRecording() })} />}
            {isHost && <MoreControlButton icon={capturingScreenshot ? <Loader2 className="animate-spin" /> : <Camera />} label="Screenshot" active={capturingScreenshot} onClick={() => requestMoreControlAction({ title: "Take a screenshot?", description: inApp ? "A picture of everyone's video in this call will be saved to your Photos." : "Your browser will ask which screen to capture, then save the screenshot to your device.", confirmLabel: inApp ? "Take screenshot" : "Choose a screen", run: takeScreenScreenshot })} />}
            {inApp ? (
              // The share options open new windows, which the app's web view
              // blocks; the phone's own share sheet is used instead.
              <MoreControlButton
                icon={<Share2 />}
                label="Share invite"
                onClick={() => {
                  setShowMoreControls(false);
                  postToEmbedHost({
                    type: "cmeet:share",
                    title: meeting.title,
                    text: `Join the live meeting "${meeting.title}" on CDS Space cMeet.`,
                    url: new URL(buildCMeetPath(code, meeting.title), window.location.origin).toString(),
                  });
                }}
              />
            ) : (
              <UniversalShareButton
                title={meeting.title}
                text={`Join the live meeting "${meeting.title}" on CDS Space cMeet.`}
                url={buildCMeetPath(code, meeting.title)}
                label="Share invite"
                className="min-h-[76px] w-full flex-col rounded-2xl border-white/10 bg-white/5 px-2 text-[11px] font-medium text-white shadow-none hover:border-[#6B92FF] hover:bg-white/10"
              />
            )}
            {canEndStream && <MoreControlButton icon={<CircleStop />} label="End stream" tone="danger" onClick={() => { setShowEndConfirm(true); setShowMoreControls(false); }} />}
            <MoreControlButton icon={<PhoneOff />} label="Leave" tone="danger" onClick={() => requestMoreControlAction({ title: "Leave this meeting?", description: "Your camera, microphone, translation and meeting connections will close. You can rejoin while the meeting remains open.", confirmLabel: "Leave meeting", tone: "danger", run: () => hangUp() })} />
          </MoreControlsModal>
        )}
        {showTranslation && (
          <TranslationSettingsModal
            value={translation}
            state={translationState}
            onChange={setTranslation}
            onClose={() => setShowTranslation(false)}
          />
        )}
        {showAgenda && (
          <AgendaModal
            items={agendaItems}
            busyId={agendaBusyId}
            canAdd={isHost}
            adding={agendaAdding}
            onAdd={addAgendaItem}
            onToggle={toggleAgendaItem}
            onClose={() => setShowAgenda(false)}
          />
        )}
        {pendingControlAction && (
          <ControlActionModal
            action={pendingControlAction}
            dark={isDark}
            onClose={() => setPendingControlAction(null)}
          />
        )}
        {showEndConfirm && (
          <EndStreamConfirm
            busy={endingStream}
            onCancel={() => setShowEndConfirm(false)}
            onConfirm={async () => { await endStreamForEveryone(); setShowEndConfirm(false); }}
          />
        )}
      </ViewportPortal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Meeting agenda                                                    */
/* ------------------------------------------------------------------ */
function AgendaModal({
  items,
  busyId,
  canAdd,
  adding,
  onAdd,
  onToggle,
  onClose,
}: {
  items: AgendaItem[];
  busyId: string | null;
  canAdd: boolean;
  adding: boolean;
  onAdd: (title: string) => void | Promise<void>;
  onToggle: (item: AgendaItem) => void | Promise<void>;
  onClose: () => void;
}) {
  const [newItem, setNewItem] = useState("");
  const openItems = items.filter((item) => !item.completed_at);
  const discussedItems = items.filter((item) => Boolean(item.completed_at));
  const submitItem = async () => {
    const title = newItem.trim();
    if (!title || adding) return;
    try {
      await onAdd(title);
      setNewItem("");
    } catch { /* The parent shows the actionable error. */ }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/55 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Meeting agenda" onClick={(event) => event.stopPropagation()} className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0F1A4A] text-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0A4FE8]"><ListChecks className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Meeting agenda</h2>
            <p className="text-[11px] text-white/45">The host adds items. Everyone can mark them discussed.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white" aria-label="Close agenda"><XIcon className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {canAdd && (
            <form
              className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2"
              onSubmit={(event) => { event.preventDefault(); void submitItem(); }}
            >
              <input
                value={newItem}
                onChange={(event) => setNewItem(event.target.value)}
                maxLength={180}
                placeholder="Add an agenda item"
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0A1130] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#6B92FF]"
              />
              <button
                type="submit"
                disabled={adding || !newItem.trim()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 text-xs font-semibold text-white disabled:opacity-45"
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </button>
            </form>
          )}
          <AgendaSection title="To discuss" items={openItems} busyId={busyId} onToggle={onToggle} />
          <AgendaSection title="Discussed" items={discussedItems} busyId={busyId} onToggle={onToggle} discussed />
        </div>
      </section>
    </div>
  );
}

function AgendaSection({
  title,
  items,
  busyId,
  onToggle,
  discussed = false,
}: {
  title: string;
  items: AgendaItem[];
  busyId: string | null;
  onToggle: (item: AgendaItem) => void | Promise<void>;
  discussed?: boolean;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/70">{title}</h3>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/45">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void onToggle(item)}
                className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:border-[#6B92FF]/60 hover:bg-white/[0.07] disabled:opacity-60"
              >
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${discussed ? "border-[#6B92FF] bg-[#0A4FE8]" : "border-white/30"}`}>
                  {busyId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : discussed ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className={`text-sm leading-5 ${discussed ? "text-white/45 line-through" : "text-white/90"}`}>{item.title}</span>
                {discussed && <RotateCcw className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-white/35" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-white/35">
          {discussed ? "No discussed items yet." : "No agenda items were added."}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Participant tile                                                  */
/* ------------------------------------------------------------------ */
type AudioParticipant = {
  name: string;
  label: string;
  avatarUrl: string | null;
  participantKind: CMeetParticipantKind;
  handRaised: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
};

function participantInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

function AudioParticipantGrid({
  local,
  remotes,
  activeSpeaker,
  localSpeaking,
  captions,
  translationEnabled,
  onMute,
  onRemove,
}: {
  local: AudioParticipant;
  remotes: RemotePeer[];
  activeSpeaker: string | null;
  localSpeaking: boolean;
  captions: Record<string, { text: string; done: boolean }>;
  translationEnabled: boolean;
  onMute?: (peer: RemotePeer) => void;
  onRemove?: (peer: RemotePeer) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
      <div className="m-auto grid w-full max-w-4xl justify-center gap-x-4 gap-y-7 sm:gap-x-8 sm:gap-y-9" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(96px, 132px))" }}>
        <AudioParticipantBubble participant={local} speaking={localSpeaking} />
        {remotes.map((peer) => (
          <AudioParticipantBubble
            key={peer.peerId}
            participant={{
              name: peer.name,
              label: `${peer.name}${peer.hostRole ? ` · ${peer.hostRole}` : peer.isHost ? " · host" : ""}`,
              avatarUrl: peer.participantKind === "admin" ? "/favicon.png" : peer.avatarUrl,
              participantKind: peer.participantKind,
              handRaised: peer.handRaised,
              hasAudio: peer.hasAudio,
              hasVideo: peer.hasVideo,
            }}
            speaking={activeSpeaker === peer.peerId}
            quality={peer.quality}
            caption={translationEnabled ? captions[peer.peerId]?.text : undefined}
            onMute={onMute && peer.hasAudio ? () => onMute(peer) : undefined}
            onRemove={onRemove ? () => onRemove(peer) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function AudioParticipantBubble({
  participant,
  speaking,
  quality = "good",
  caption,
  onMute,
  onRemove,
}: {
  participant: AudioParticipant;
  speaking: boolean;
  quality?: ConnectionQuality;
  caption?: string;
  onMute?: () => void;
  onRemove?: () => void;
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatar = participant.participantKind === "admin" ? "/favicon.png" : participant.avatarUrl;
  const isAdmin = participant.participantKind === "admin";
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="relative h-24 w-24 sm:h-32 sm:w-32">
        {speaking && <SpeakingWaves />}
        {participant.handRaised && (
          <span className="cmeet-hand-attention absolute -right-1.5 -top-3 z-30 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-amber-400 text-[#271700] shadow-lg" title="Hand raised" aria-label="Hand raised">
            <Hand className="h-4 w-4" />
          </span>
        )}
        <MediaStatusBadges
          hasAudio={participant.hasAudio}
          hasVideo={participant.hasVideo}
          audioOnly
          onMute={onMute}
          onRemove={onRemove}
          participantName={participant.name}
          className="-bottom-3 left-1/2 -translate-x-1/2"
        />
        <div className={`relative h-full w-full overflow-hidden rounded-full border-2 shadow-lg transition ${isAdmin ? "bg-[#0A4FE8]" : "bg-[#0F1A4A]"} ${speaking ? "border-[#5B8CFF] ring-2 ring-[#5B8CFF]/35" : "border-white/15"}`}>
          {avatar && !avatarFailed ? (
            <img src={avatar} alt="" className={`h-full w-full ${isAdmin ? "scale-[1.18] object-contain" : "object-cover"}`} onError={() => setAvatarFailed(true)} />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[#0A4FE8] text-2xl font-semibold text-white sm:text-3xl">
              {participantInitials(participant.name)}
            </div>
          )}
          {quality !== "good" && (
            <span className={`absolute left-1/2 top-2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-semibold ${quality === "poor" ? "bg-rose-600 text-white" : "bg-amber-300 text-slate-950"}`}>
              {quality === "poor" ? "Weak" : "Unstable"}
            </span>
          )}
          {caption && (
            <div aria-live="polite" className="absolute inset-x-1.5 bottom-2 max-h-12 overflow-hidden rounded-lg bg-black/80 px-2 py-1 text-[9px] font-medium leading-3.5 text-white backdrop-blur-sm sm:text-[10px]">
              {caption}
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 max-w-[132px] truncate text-[11px] font-semibold sm:text-xs">{participant.label}</p>
    </div>
  );
}

function SpeakingWaves() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      <span className="cmeet-speaking-wave absolute -inset-2 rounded-full border-2 border-[#5B8CFF]/70" />
      <span className="cmeet-speaking-wave absolute -inset-4 rounded-full border border-[#5B8CFF]/50 [animation-delay:240ms]" />
      <span className="cmeet-speaking-wave absolute -inset-6 rounded-full border border-[#5B8CFF]/30 [animation-delay:480ms]" />
    </span>
  );
}

type LocalGridParticipant = {
  stream: MediaStream | null;
  label: string;
  showVideoOff: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  language: string;
};

export type CMeetViewportLayout = "mobile-portrait" | "mobile-landscape" | "tablet-portrait" | "tablet-landscape" | "desktop";

export function cmeetViewportLayout(width: number, height: number): CMeetViewportLayout {
  const portrait = height > width;
  if (portrait && width < 600) return "mobile-portrait";
  if (!portrait && height < 600) return "mobile-landscape";
  if (portrait && width <= 1024) return "tablet-portrait";
  if (!portrait && width <= 1366) return "tablet-landscape";
  return "desktop";
}

function AdaptiveParticipantGrid({
  local,
  remotes,
  activeSpeaker,
  localSpeaking,
  captions,
  translationEnabled,
  targetLanguage,
  localHandRaised,
  onShowAll,
  onMute,
  onRemove,
}: {
  local: LocalGridParticipant;
  remotes: RemotePeer[];
  activeSpeaker: string | null;
  localSpeaking: boolean;
  captions: Record<string, { text: string; done: boolean }>;
  translationEnabled: boolean;
  targetLanguage: string;
  localHandRaised: boolean;
  onShowAll?: () => void;
  onMute?: (peer: RemotePeer) => void;
  onRemove?: (peer: RemotePeer) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 960, height: 640 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const total = remotes.length + 1;
  const viewportLayout = cmeetViewportLayout(size.width, size.height);
  const limit = viewportLayout === "mobile-portrait"
    ? 4
    : viewportLayout === "mobile-landscape"
      ? 6
      : viewportLayout === "tablet-portrait"
        ? 9
        : viewportLayout === "tablet-landscape"
          ? 12
          : 16;
  const slots = Math.min(total, limit);
  const targetRatio = viewportLayout === "mobile-portrait" ? 1 : viewportLayout === "tablet-portrait" ? 4 / 3 : 16 / 10;
  const maxColumns = viewportLayout === "mobile-portrait" ? 2 : viewportLayout === "tablet-portrait" ? 3 : 6;
  let columns = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  const gap = size.width < 600 ? 8 : 12;
  for (let candidate = 1; candidate <= Math.min(slots, maxColumns); candidate += 1) {
    const candidateRows = Math.ceil(slots / candidate);
    const cellWidth = (size.width - Math.max(0, candidate - 1) * gap) / candidate;
    const cellHeight = (size.height - Math.max(0, candidateRows - 1) * gap) / candidateRows;
    const fittedWidth = Math.min(cellWidth, cellHeight * targetRatio);
    const fittedHeight = fittedWidth / targetRatio;
    const unusedArea = 1 - ((fittedWidth * fittedHeight * slots) / Math.max(1, size.width * size.height));
    const emptyCellPenalty = (candidate * candidateRows - slots) * 0.06;
    const score = unusedArea + emptyCellPenalty;
    if (score < bestScore) {
      bestScore = score;
      columns = candidate;
    }
  }
  if (viewportLayout === "mobile-portrait" && slots > 1) columns = Math.min(2, slots);
  const rows = Math.ceil(slots / columns);
  const cellWidth = (size.width - Math.max(0, columns - 1) * gap) / columns;
  const cellHeight = (size.height - Math.max(0, rows - 1) * gap) / rows;
  const tileWidth = Math.max(84, Math.min(cellWidth, cellHeight * targetRatio));
  const tileHeight = Math.max(84, tileWidth / targetRatio);
  const hiddenCount = total > limit ? total - (limit - 1) : 0;
  const orderedRemotes = activeSpeaker
    ? [...remotes].sort((left, right) => Number(right.peerId === activeSpeaker) - Number(left.peerId === activeSpeaker))
    : remotes;
  const visibleRemotes = hiddenCount > 0 ? orderedRemotes.slice(0, Math.max(0, limit - 2)) : orderedRemotes;

  return (
    <div
      ref={containerRef}
      data-viewport-layout={viewportLayout}
      className="grid min-h-0 flex-1 place-content-center overflow-hidden"
      style={{
        gap,
        gridTemplateColumns: `repeat(${columns}, minmax(0, ${tileWidth}px))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, ${tileHeight}px))`,
      }}
    >
      <ParticipantTile
        stream={local.stream}
        label={local.label}
        muted
        showVideoOff={local.showVideoOff}
        hasAudio={local.hasAudio}
        hasVideo={local.hasVideo}
        handRaised={localHandRaised}
        speaking={localSpeaking}
        language={local.language}
        large
        fit
      />
      {visibleRemotes.map((peer) => (
        <ParticipantTile
          key={peer.peerId}
          stream={peer.stream}
          label={`${peer.name}${peer.hostRole ? ` · ${peer.hostRole}` : peer.isHost ? " · host" : ""}`}
          showVideoOff={!peer.hasVideo}
          hasAudio={peer.hasAudio}
          hasVideo={peer.hasVideo}
          speaking={activeSpeaker === peer.peerId}
          quality={peer.quality}
          handRaised={peer.handRaised}
          onMute={onMute && peer.hasAudio ? () => onMute(peer) : undefined}
          onRemove={onRemove ? () => onRemove(peer) : undefined}
          caption={translationEnabled ? captions[peer.peerId]?.text : undefined}
          language={translationEnabled ? `${languageBadge(peer.spokenLanguage)} → ${languageBadge(targetLanguage)}` : undefined}
          large
          fit
        />
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          disabled={!onShowAll}
          className="flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition enabled:hover:border-[#6B92FF] enabled:hover:bg-white/10 disabled:cursor-default"
          aria-label={`Show all participants. ${hiddenCount} more people.`}
        >
          <Users className="mb-2 h-6 w-6 text-[#8DAAFF]" />
          <span className="text-xl font-semibold">+{hiddenCount}</span>
          <span className="mt-1 text-xs text-white/55">others</span>
        </button>
      )}
    </div>
  );
}

function ParticipantTile({
  stream,
  label,
  showVideoOff = false,
  hasAudio = true,
  hasVideo = true,
  large = false,
  fit = false,
  speaking = false,
  quality = "good",
  language,
  handRaised = false,
  caption,
  onMute,
  onRemove,
}: {
  stream: MediaStream | null;
  label: string;
  /** Kept for call-site compatibility; every tile is muted - audio plays from RemoteAudio. */
  muted?: boolean;
  showVideoOff?: boolean;
  hasAudio?: boolean;
  hasVideo?: boolean;
  large?: boolean;
  fit?: boolean;
  speaking?: boolean;
  quality?: ConnectionQuality;
  language?: string;
  handRaised?: boolean;
  caption?: string;
  onMute?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className={`relative overflow-visible rounded-2xl border bg-black transition-[box-shadow,border-color] duration-200 ${speaking ? "border-[#5B8CFF] shadow-[0_0_0_2px_rgba(91,140,255,0.55)]" : "border-white/10"} ${fit ? "h-full min-h-0 w-full min-w-0" : `aspect-square ${large ? "w-full" : "w-[112px] shrink-0 sm:w-[128px]"}`}`}>
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <VideoTile stream={stream} muted />
        {showVideoOff && (
          <div className="absolute inset-0 bg-[#0A1130]/80 flex items-center justify-center">
            <VideoOff className={`${large ? "w-7 h-7" : "w-4 h-4"} text-white/40`} />
          </div>
        )}
      </div>
      {quality !== "good" && (
        <div
          title={quality === "poor" ? "Weak connection" : "Unstable connection"}
          className={`absolute right-2 top-9 px-1.5 py-0.5 rounded text-[9px] font-semibold ${quality === "poor" ? "bg-rose-500/85" : "bg-amber-400/85 text-black"}`}
        >
          {quality === "poor" ? "Weak" : "Unstable"}
        </div>
      )}
      {language && (
        <div data-no-translate className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-[#B8C8FF]">
          {language}
        </div>
      )}
      {handRaised && (
        <div className="cmeet-hand-attention absolute -right-2 -top-3 z-30 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-amber-400 text-[#271700] shadow-lg" title="Hand raised" aria-label="Hand raised">
          <Hand className="h-4 w-4" />
        </div>
      )}
      {/* Name and controls sit on the bottom edge, clear of the face in the
          middle of the frame; the fade keeps them readable on any video. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-[inherit] bg-gradient-to-t from-black/70 to-transparent" />
      {caption && <ParticipantCaption text={caption} />}
      <div className={`absolute bottom-2 left-2 max-w-[55%] truncate rounded-md bg-black/45 px-1.5 py-0.5 font-medium text-white backdrop-blur-sm ${large ? "text-[11px]" : "text-[9.5px]"}`}>
        {label}
      </div>
      <MediaStatusBadges compact hasAudio={hasAudio} hasVideo={hasVideo} onMute={onMute} onRemove={onRemove} participantName={label} className="bottom-2 right-2" />
    </div>
  );
}

function MediaStatusBadges({
  hasAudio,
  hasVideo,
  audioOnly = false,
  onMute,
  onRemove,
  participantName,
  className,
  compact = false,
}: {
  hasAudio: boolean;
  hasVideo: boolean;
  audioOnly?: boolean;
  /** Smaller badges for the corner of a video tile. */
  compact?: boolean;
  onMute?: () => void;
  onRemove?: () => void;
  participantName?: string;
  className: string;
}) {
  const badge = compact ? "h-6 w-6 border-[1.5px]" : "h-7 w-7 border-2";
  // mobile.css gives every labelled button a 40px minimum. Compact buttons keep
  // that touch area as an invisible ring around a small visible badge.
  const tapArea = compact ? "relative !min-h-0 !min-w-0 after:absolute after:-inset-2 after:rounded-full after:content-['']" : "";
  const icon = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const microphoneClass = `grid ${badge} place-items-center rounded-full border-white shadow-md transition ${hasAudio ? "bg-[#0A4FE8] text-white" : "bg-rose-600 text-white"}`;
  const microphoneTitle = hasAudio
    ? onMute ? "Microphone on. Click to mute this participant." : "Microphone on"
    : "Microphone muted";
  const microphone = hasAudio ? <Mic className={icon} /> : <MicOff className={icon} />;

  return (
    <div className={`absolute z-30 flex items-center gap-1 ${className}`}>
      {onRemove && (
        <button type="button" onClick={onRemove} className={`grid ${badge} ${tapArea} place-items-center rounded-full border-white bg-rose-600 text-white shadow-md transition hover:scale-105 hover:bg-rose-700`} aria-label={`Remove ${participantName || "participant"}`} title={`Remove ${participantName || "participant"}`}>
          <XIcon className={icon} />
        </button>
      )}
      {onMute && hasAudio ? (
        <button type="button" onClick={onMute} className={`${microphoneClass} ${tapArea} hover:scale-105 hover:bg-rose-600`} aria-label="Mute participant" title={microphoneTitle}>
          {microphone}
        </button>
      ) : (
        <span className={microphoneClass} aria-label={microphoneTitle} title={microphoneTitle}>
          {microphone}
        </span>
      )}
      {!audioOnly && (
        <span className={`grid ${badge} place-items-center rounded-full border-white shadow-md ${hasVideo ? "bg-[#0A4FE8] text-white" : "bg-rose-600 text-white"}`} aria-label={hasVideo ? "Camera on" : "Camera off"} title={hasVideo ? "Camera on" : "Camera off"}>
          {hasVideo ? <Video className={icon} /> : <VideoOff className={icon} />}
        </span>
      )}
    </div>
  );
}

function ParticipantCaption({ text }: { text: string }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-2 bottom-20 z-10 max-h-[4.5em] overflow-hidden rounded-lg bg-black/80 px-2.5 py-1.5 text-center text-[10px] font-medium leading-[1.35] text-white shadow-lg backdrop-blur-sm sm:text-xs">
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Control button                                                    */
/* ------------------------------------------------------------------ */
function ControlActionModal({ action, dark, onClose }: { action: ConfirmableControlAction; dark: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await action.run();
      onClose();
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "That meeting action could not be completed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
      <section role="dialog" aria-modal="true" aria-label={action.title} onClick={(event) => event.stopPropagation()} className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${dark ? "border-white/10 bg-[#0F1A4A] text-white" : "border-[#DDE5F2] bg-white text-[#0D1B39]"}`}>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${action.tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-[#0A4FE8]"}`}><Info className="h-5 w-5" /></span>
        <h2 className="mt-4 text-base font-semibold">{action.title}</h2>
        <p className={`mt-2 text-sm leading-6 ${dark ? "text-white/55" : "text-slate-600"}`}>{action.description}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={onClose} className={`h-11 rounded-xl border text-sm font-semibold ${dark ? "border-white/10 bg-white/5 text-white/75 hover:bg-white/10" : "border-[#DDE5F2] bg-white text-slate-600 hover:bg-slate-50"}`}>Close</button>
          <button type="button" disabled={busy} onClick={() => void confirm()} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 ${action.tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-[#0A4FE8] hover:bg-[#083EC0]"}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{action.confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function ControlButton({
  onClick, active, icon, title, dark,
}: { onClick: () => void; active: boolean; icon: React.ReactNode; title?: string; dark: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-11 w-full min-w-0 items-center justify-center rounded-xl px-3 transition sm:h-10 sm:w-10 sm:rounded-full sm:px-0 ${
        active ? "bg-rose-600 text-white" : dark ? "bg-white/10 text-white hover:bg-white/20" : "border border-[#DDE5F2] bg-white text-[#0D1B39] hover:border-blue-200 hover:text-[#0A4FE8]"
      }`}
    >
      {icon}
    </button>
  );
}

function MoreControlsModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="More meeting controls"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-[#0F1A4A] p-4 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between px-1">
          <div>
            <h2 className="text-base font-semibold">Meeting controls</h2>
            <p className="mt-0.5 text-[11px] text-white/50">All call actions in one place</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white/65 hover:bg-white/15 hover:text-white" aria-label="Close meeting controls">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">{children}</div>
      </section>
    </div>
  );
}

function MoreControlButton({
  icon,
  label,
  onClick,
  active = false,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center text-[11px] font-medium transition ${
        tone === "danger"
          ? "border-rose-400/25 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
          : active
            ? "border-[#6B92FF] bg-[#0A4FE8] text-white"
            : "border-white/10 bg-white/5 text-white/75 hover:border-[#6B92FF] hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function TranslationSettingsModal({
  value,
  state,
  onChange,
  onClose,
}: {
  value: CMeetTranslationPreferences;
  state: "off" | "connecting" | "live" | "unavailable";
  onChange: (value: CMeetTranslationPreferences) => void;
  onClose: () => void;
}) {
  const update = <K extends keyof CMeetTranslationPreferences>(key: K, next: CMeetTranslationPreferences[K]) => {
    onChange({ ...value, [key]: next });
  };
  const stateLabel = state === "connecting"
    ? "Connecting…"
    : state === "live"
      ? "Live"
      : state === "unavailable"
        ? "Unavailable"
        : "Off";

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/70 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0F1A4A] p-5 text-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-[#8DAAFF]" />
              <h2 className="text-base font-semibold">Live translation</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-white/55">Speak naturally. Hear each person in the language you choose.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white" aria-label="Close translation settings">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
          <span>
            <span className="block text-sm font-medium">Translate this call</span>
            <span className={`mt-0.5 block text-[11px] ${state === "unavailable" ? "text-rose-300" : "text-white/45"}`}>{stateLabel}</span>
          </span>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => {
              if (event.target.checked) primeCMeetTranslationPlayback();
              update("enabled", event.target.checked);
            }}
            className="h-5 w-5 accent-[#0A4FE8]"
          />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-white/65">
            Language I speak
            <select
              value={value.spokenLanguage}
              onChange={(event) => update("spokenLanguage", event.target.value as CMeetTranslationPreferences["spokenLanguage"])}
              className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#0A1130] px-3 text-sm text-white outline-none focus:border-[#6B92FF]"
            >
              {CMEET_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-white/65">
            Language I want to hear
            <select
              value={value.heardLanguage}
              onChange={(event) => update("heardLanguage", event.target.value as CMeetTranslationPreferences["heardLanguage"])}
              className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#0A1130] px-3 text-sm text-white outline-none focus:border-[#6B92FF]"
            >
              {CMEET_LANGUAGES.filter((language) => language.code !== "auto").map((language) => (
                <option key={language.code} value={language.code}>{language.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-white/10 p-3">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Translated captions</span>
            <input type="checkbox" checked={value.captions} onChange={(event) => update("captions", event.target.checked)} className="h-4 w-4 accent-[#0A4FE8]" />
          </label>
          <label className="block pt-1 text-sm">
            <span className="flex items-center justify-between"><span>Translation volume</span><span className="text-xs text-white/45">{Math.round(value.volume * 100)}%</span></span>
            <input type="range" min="0" max="1" step="0.05" value={value.volume} onChange={(event) => update("volume", Number(event.target.value))} className="mt-2 w-full accent-[#0A4FE8]" />
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-[#6B92FF]/25 bg-[#0A4FE8]/10 px-3 py-2.5 text-[11px] leading-5 text-white/60">
          <p>Your listening language applies only to you. It is not shared with or applied to anyone else in the call.</p>
          <p className="mt-1">When live translation is on, every remote speaker is translated only for you into your selected listening language.</p>
          <p className="mt-1">A speaker being translated has their own audio muted, so you hear one voice rather than two.</p>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-[#0A4FE8]/15 px-3 py-2 text-xs">
          <span className="text-white/60">Your language badge</span>
          <span data-no-translate className="rounded-md bg-[#0A4FE8] px-2 py-1 font-semibold text-white">
            {languageBadge(value.spokenLanguage)} → {languageBadge(value.heardLanguage)}
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-white/40">Automatic detection remains available for the language you speak. Translation streams while each person is talking for the lowest practical delay.</p>
      </div>
    </div>
  );
}

function ParticipantListAvatar({ name, avatarUrl, isAdmin = false }: { name: string; avatarUrl: string | null; isAdmin?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold text-white ${isAdmin ? "bg-[#0A4FE8]" : "bg-[#24457E]"}`}>
      {avatarUrl && !failed
        ? <img src={avatarUrl} alt="" className={`h-full w-full ${isAdmin ? "scale-[1.16] object-contain" : "object-cover"}`} onError={() => setFailed(true)} />
        : participantInitials(name)}
    </span>
  );
}

function ParticipantListDropdown({
  localName,
  localAvatarUrl,
  localHasAudio,
  localHasVideo,
  remotes,
  onMute,
  onRemove,
  onClose,
}: {
  localName: string;
  localAvatarUrl: string | null;
  localHasAudio: boolean;
  localHasVideo: boolean;
  remotes: RemotePeer[];
  onMute: (peer: RemotePeer) => void;
  onRemove: (peer: RemotePeer) => void;
  onClose: () => void;
}) {
  return (
    <div role="dialog" aria-label="Participants" className="fixed right-3 top-[62px] z-[170] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#0A1130] text-white shadow-2xl sm:right-5">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Participants</h2>
          <p className="text-xs text-white/45">{remotes.length + 1} people in this meeting</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl bg-white/10 p-2 hover:bg-white/15" aria-label="Close participant list">
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-[min(60dvh,32rem)] divide-y divide-white/10 overflow-y-auto p-2">
        <li className="flex items-center gap-3 rounded-xl px-2 py-2.5">
          <ParticipantListAvatar name={localName} avatarUrl={localAvatarUrl} isAdmin />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{localName} (you)</p><p className="text-[11px] text-white/45">Super admin · host</p></div>
          <span className="inline-flex items-center gap-1.5 text-white/65" aria-label={`Your microphone is ${localHasAudio ? "on" : "muted"}; your camera is ${localHasVideo ? "on" : "off"}`}>
            {localHasAudio ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5 text-rose-300" />}
            {localHasVideo ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5 text-rose-300" />}
          </span>
        </li>
        {remotes.map((peer) => (
          <li key={peer.peerId} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/5">
            <ParticipantListAvatar name={peer.name} avatarUrl={peer.participantKind === "admin" ? "/favicon.png" : peer.avatarUrl} isAdmin={peer.participantKind === "admin"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5"><p className="truncate text-sm font-medium">{peer.name}</p>{peer.handRaised && <Hand className="h-3.5 w-3.5 shrink-0 text-amber-300" />}</div>
              <p className="text-[11px] text-white/45">{peer.hostRole || (peer.isHost ? "host" : peer.participantKind)} · {peer.hasAudio ? "mic on" : "mic muted"} · {peer.hasVideo ? "camera on" : "camera off"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-white/65" aria-label={`${peer.name}'s microphone is ${peer.hasAudio ? "on" : "muted"}; camera is ${peer.hasVideo ? "on" : "off"}`}>
              {peer.hasAudio ? (
                <button type="button" onClick={() => onMute(peer)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-rose-200" aria-label={`Mute ${peer.name}`} title={`Mute ${peer.name}`}><Mic className="h-3.5 w-3.5" /></button>
              ) : <span className="grid h-8 w-8 place-items-center"><MicOff className="h-3.5 w-3.5 text-rose-300" /></span>}
              {peer.hasVideo ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5 text-rose-300" />}
            </div>
            <button type="button" onClick={() => onRemove(peer)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/20" aria-label={`Remove ${peer.name}`}>
              <XIcon className="h-3 w-3" /> Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  End-stream confirm                                                */
/* ------------------------------------------------------------------ */
function EndStreamConfirm({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/70 p-3 backdrop-blur-sm sm:p-4" onClick={onCancel}>
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
