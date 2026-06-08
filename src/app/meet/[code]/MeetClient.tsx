"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, ScreenShare, ScreenShareOff,
  MessageCircle, Send, Smile, X as XIcon, Loader2, Share2, Copy, Check,
  Facebook, Linkedin, AtSign, Search, CircleStop, AlertTriangle, Users,
} from "lucide-react";
import { CMeetClient, type RemotePeer, type ChatMessage } from "@/lib/cmeet-rtc";
import { appAlert } from "@/lib/app-notify";

/* ------------------------------------------------------------------ */
/*  Emoji hinting                                                     */
/* ------------------------------------------------------------------ */
const EMOJI_HINTS: Record<string, string[]> = {
  thanks: ["🙏", "💚", "🙌"],
  great: ["🔥", "🚀", "✨"],
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
/*  Live video tile — subscribes to a MediaStream and paints it.     */
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
      // Autoplay can be blocked on Safari/iOS until user interaction — retry once muted.
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
      className={`w-full h-full bg-black ${objectFit === "contain" ? "object-contain" : "object-cover"} ${className}`}
    />
  );
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

  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null); // kept so we can restore after screen-share

  // Peers
  const [remotes, setRemotes] = useState<RemotePeer[]>([]);
  const clientRef = useRef<CMeetClient | null>(null);

  // Chat (source of truth: CMeetClient.onChat — which already fires with self:true on send)
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiHints = useMemo(() => hintEmojis(chatInput), [chatInput]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Side panels
  const [showShare, setShowShare] = useState(false);
  const [showTag, setShowTag] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endingStream, setEndingStream] = useState(false);

  /* -------- Load meeting + session -------- */
  useEffect(() => {
    if (!code) return;
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
      localStream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        audio,
        video: wantVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);

      const peerId = crypto.randomUUID();
      const client = new CMeetClient(code, peerId, name, {
        onRemoteUpdate: (peers) => setRemotes([...peers]),
        onChat: (m) => setChat((prev) => [...prev, m]),
        onError: (e) => console.error("[cMeet]", e),
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

  /* -------- Controls -------- */
  function toggleMic() {
    if (!localStream) return;
    const next = !micOn;
    localStream.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }

  function toggleCam() {
    if (!localStream) return;
    const next = !camOn;
    localStream.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  }

  async function toggleShare() {
    const client = clientRef.current;
    if (!client || !localStream) return;

    if (sharing) {
      // Stop screen share, restore camera track
      try {
        let camTrack = cameraTrackRef.current;
        if (!camTrack || camTrack.readyState !== "live") {
          const fresh = await navigator.mediaDevices.getUserMedia({ video: true });
          camTrack = fresh.getVideoTracks()[0];
          cameraTrackRef.current = camTrack;
        }
        await client.replaceVideoTrack(camTrack, { sharing: false });

        // Update the local MediaStream so our preview swaps back
        const current = localStream.getVideoTracks()[0];
        if (current) {
          try { current.stop(); } catch {}
          localStream.removeTrack(current);
        }
        localStream.addTrack(camTrack);
        // Force a new reference so VideoTile useEffect re-binds
        setLocalStream(new MediaStream(localStream.getTracks()));
        setSharing(false);
      } catch (e) {
        console.error("Stop share failed", e);
      }
      return;
    }

    try {
      const disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const shareTrack: MediaStreamTrack = disp.getVideoTracks()[0];
      shareTrack.onended = () => { toggleShare(); };

      await client.replaceVideoTrack(shareTrack, { sharing: true });

      // Replace the video track in our local preview stream
      const prev = localStream.getVideoTracks()[0];
      if (prev) {
        localStream.removeTrack(prev);
        // Keep the camera track alive so we can swap back
        cameraTrackRef.current = prev;
      }
      localStream.addTrack(shareTrack);
      setLocalStream(new MediaStream(localStream.getTracks()));
      setSharing(true);
    } catch (e) {
      console.warn("Screen share cancelled", e);
    }
  }

  function sendChat() {
    const body = chatInput.trim();
    if (!body || !clientRef.current) return;
    clientRef.current.sendChat(body);
    setChatInput("");
  }

  function hangUp(opts?: { notice?: string }) {
    try { clientRef.current?.leave(); } catch {}
    localStream?.getTracks().forEach((t) => t.stop());
    if (cameraTrackRef.current) { try { cameraTrackRef.current.stop(); } catch {} }
    clientRef.current = null;
    setJoined(false);
    if (opts?.notice) appAlert(opts.notice);
    router.push("/team/cmeet");
  }

  async function endStreamForEveryone() {
    if (!code) return;
    setEndingStream(true);
    try {
      await fetch(`/api/cmeet/${code}`, { method: "DELETE" });
      try { clientRef.current?.sendChat("__host_ended_stream__"); } catch {}
      hangUp();
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
    <div className="h-screen bg-[#0A1130] text-white flex flex-col">
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

      <main className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 p-4 flex flex-col gap-3 min-h-0">
          {presenter ? (
            <>
              {/* Big presenter stage */}
              <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-black border border-white/10 relative">
                {presenter === "local" ? (
                  <VideoTile key={localStream?.id || "local"} stream={localStream} muted objectFit="contain" />
                ) : (
                  <VideoTile key={presenter.peer.stream.id} stream={presenter.peer.stream} objectFit="contain" />
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
        <ControlButton onClick={() => setShowTag(true)} active={showTag} icon={<AtSign className="w-4 h-4" />} title="Tag teammates" />
        <ControlButton onClick={() => setShowShare(true)} active={false} icon={<Share2 className="w-4 h-4" />} title="Share live" />
        {canEndStream && (
          <button
            onClick={() => setShowEndConfirm(true)}
            className="ml-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-700 text-white text-[12.5px] font-semibold hover:bg-rose-800"
            title="End stream for everyone"
          >
            <CircleStop className="w-4 h-4" /> End stream
          </button>
        )}
        <button onClick={() => hangUp()} className="ml-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-600 text-white text-[12.5px] font-semibold">
          <PhoneOff className="w-4 h-4" /> Leave
        </button>
      </footer>

      {showShare && <ShareLiveModal title={meeting.title} code={code!} onClose={() => setShowShare(false)} />}
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
  muted = false,
  showVideoOff = false,
  large = false,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  showVideoOff?: boolean;
  large?: boolean;
}) {
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-black border border-white/10 ${large ? "w-full h-full" : "w-[180px] h-[110px] shrink-0"}`}>
      <VideoTile stream={stream} muted={muted} />
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

/* ------------------------------------------------------------------ */
/*  Share live modal                                                  */
/* ------------------------------------------------------------------ */
function ShareLiveModal({ title, code, onClose }: { title: string; code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/meet/${code}` : `/meet/${code}`;
  const text = `Join the live meeting "${title}" on CDS Space cMeet: ${url}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  function open(href: string) { window.open(href, "_blank", "noopener,noreferrer,width=640,height=640"); }
  async function nativeShare() {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); } catch {}
    } else {
      copy();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white text-[#0D1B39] rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold">Share live meeting</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Anyone with this link can join.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-50"><XIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 flex items-center gap-2">
            <Share2 className="w-3.5 h-3.5 text-[#0A4FE8] shrink-0" />
            <input readOnly value={url} onClick={(e) => (e.target as HTMLInputElement).select()} className="flex-1 bg-transparent font-mono text-[11px] outline-none truncate" />
            <button onClick={copy} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0A4FE8] text-white text-[11px] font-medium">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => open(`https://wa.me/?text=${encodeURIComponent(text)}`)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#25D366]/40 bg-white text-[#128C7E] text-[12px] font-medium hover:bg-[#25D366]/10"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</button>
            <button onClick={() => open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#229ED9]/40 bg-white text-[#229ED9] text-[12px] font-medium hover:bg-[#229ED9]/10"><Send className="w-3.5 h-3.5" /> Telegram</button>
            <button onClick={() => open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[#0D1B39] text-[12px] font-medium hover:bg-gray-50">X / Twitter</button>
            <button onClick={() => open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#0A66C2]/40 bg-white text-[#0A66C2] text-[12px] font-medium hover:bg-[#0A66C2]/10"><Linkedin className="w-3.5 h-3.5" /> LinkedIn</button>
            <button onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#1877F2]/40 bg-white text-[#1877F2] text-[12px] font-medium hover:bg-[#1877F2]/10"><Facebook className="w-3.5 h-3.5" /> Facebook</button>
            <button onClick={() => open(`mailto:?subject=${encodeURIComponent("Join me on cMeet")}&body=${encodeURIComponent(text)}`)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50">Email</button>
          </div>
          <button onClick={nativeShare} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#0A4FE8] text-white text-[12.5px] font-semibold">
            <Share2 className="w-3.5 h-3.5" /> More (native share)
          </button>
        </div>
      </div>
    </div>
  );
}
