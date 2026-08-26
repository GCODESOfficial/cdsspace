/* eslint-disable @typescript-eslint/no-explicit-any */
// Full-mesh WebRTC with GlashDB-compatible Realtime signaling.
// Every peer has 1 RTCPeerConnection per other peer. Peer A creates the
// offer when its peerId sorts lexicographically greater than peer B's -
// that rule prevents both sides from creating offers simultaneously.
//
// Signaling messages are exchanged through our own endpoint at
// /api/cmeet/<roomCode>/signal (SSE down, POST up). Message shapes:
//   { type: "join", peerId, name, hasVideo, hasAudio }
//   { type: "leave", peerId }
//   { type: "offer", from, to, sdp }
//   { type: "answer", from, to, sdp }
//   { type: "ice", from, to, candidate }
//   { type: "chat", from, name, body, at }
//
// The caller provides a local MediaStream (mic/cam). When the local
// stream changes (e.g. screen share replaces the video track), call
// `replaceVideoTrack()` to swap it everywhere without renegotiation.

import { openSignalTransport, type SignalTransport } from "@/lib/cmeet-signal";

export type ConnectionQuality = "good" | "fair" | "poor";

export type RemotePeer = {
  peerId: string;
  name: string;
  stream: MediaStream;
  /** Rolling link health, sampled from getStats() every few seconds. */
  quality: ConnectionQuality;
  hasVideo: boolean;
  hasAudio: boolean;
  isSharingScreen: boolean;
  isHost: boolean;
  memberId: string | null;
  isOwner: boolean;
  connection: RTCPeerConnection;
};

export type ChatMessage = {
  from: string;
  name: string;
  body: string;
  at: number;
  self?: boolean;
};

export type PeerConnectionState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

export type TranscriptMsg = {
  from: string;
  name: string;
  text: string;
  lang: string;
  isFinal: boolean;
  at: number;
};

export type CMeetEvents = {
  onRemoteUpdate?: (remotes: RemotePeer[]) => void;
  onChat?: (msg: ChatMessage) => void;
  onError?: (err: string) => void;
  onHostMuteAll?: (from: string) => void;
  onHostEnd?: (from: string) => void;
  onHostKicked?: (from: string) => void;
  onPeerStateChange?: (peerId: string, state: PeerConnectionState) => void;
  onTranscript?: (msg: TranscriptMsg) => void;
  /** Fires when the loudest speaker changes. `null` means nobody is talking. */
  onActiveSpeaker?: (peerId: string | null) => void;
  /** Per-peer link health, so the UI can show a weak-connection hint. */
  onQuality?: (peerId: string, quality: ConnectionQuality) => void;
};

/* ---------- Encoding profiles ----------
 * A full mesh encodes a separate stream per peer, so the send budget has to
 * shrink as the room grows or the uplink saturates and everything stutters.
 * Numbers are per-peer video bitrate ceilings. */
const VIDEO_PROFILES: { upTo: number; maxBitrate: number; maxFramerate: number; scaleDown: number }[] = [
  { upTo: 1, maxBitrate: 1_700_000, maxFramerate: 30, scaleDown: 1 },
  { upTo: 3, maxBitrate: 900_000, maxFramerate: 30, scaleDown: 1 },
  { upTo: 6, maxBitrate: 500_000, maxFramerate: 25, scaleDown: 1.5 },
  { upTo: 99, maxBitrate: 260_000, maxFramerate: 20, scaleDown: 2 },
];
// Screen share favours sharpness over motion, so it gets its own budget.
const SCREEN_PROFILE = { maxBitrate: 2_500_000, maxFramerate: 15, scaleDown: 1 };
const AUDIO_MAX_BITRATE = 40_000;

function profileFor(peerCount: number, sharing: boolean) {
  if (sharing) return SCREEN_PROFILE;
  return VIDEO_PROFILES.find((p) => peerCount <= p.upTo) || VIDEO_PROFILES[VIDEO_PROFILES.length - 1];
}

/* ---------- SDP tuning ----------
 * Opus defaults are tuned for music, not conversation. Turning on inband FEC
 * plus DTX keeps speech intelligible through 10-20% packet loss (which is what
 * makes calls sound "choppy") and stops silent participants from burning
 * bandwidth. We also raise the jitter-buffer-friendly ptime. */
function tuneSdp(sdp: string): string {
  let out = sdp;
  const opusPt = /a=rtpmap:(\d+) opus\/48000/i.exec(out)?.[1];
  if (opusPt) {
    const fmtp = new RegExp(`a=fmtp:${opusPt} ([^\r\n]*)`);
    const extras = "useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=32000;maxplaybackrate=48000";
    if (fmtp.test(out)) {
      out = out.replace(fmtp, (_m, existing: string) => {
        const kept = existing
          .split(";")
          .filter((kv) => !/^(useinbandfec|usedtx|stereo|maxaveragebitrate|maxplaybackrate)=/i.test(kv.trim()))
          .filter(Boolean)
          .join(";");
        return `a=fmtp:${opusPt} ${kept ? `${kept};` : ""}${extras}`;
      });
    } else {
      out = out.replace(new RegExp(`(a=rtpmap:${opusPt} opus/48000[^\r\n]*)`), `$1\r\na=fmtp:${opusPt} ${extras}`);
    }
    if (!/a=ptime:/.test(out)) {
      out = out.replace(new RegExp(`(a=fmtp:${opusPt} [^\r\n]*)`), "$1\r\na=ptime:20");
    }
  }
  return out;
}

// ICE configuration. Always includes free Google STUN servers. When the
// self-hosted TURN relay is configured (see deploy/coturn/), it's added
// so peers behind symmetric NAT / corporate firewalls can connect too.
// Zero third-party dependency - the TURN server runs on your own VPS.
function buildRtcConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL || "";
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME || "";
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "";
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
    // Also add a turns: (TLS) variant on port 5349 if the base URL is
    // on port 3478 - covers networks that block non-443 UDP.
    if (turnUrl.includes(":3478")) {
      servers.push({
        urls: turnUrl.replace("turn:", "turns:").replace(":3478", ":5349"),
        username: turnUser,
        credential: turnCred,
      });
    }
  }
  return {
    iceServers: servers,
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceCandidatePoolSize: 10,
  };
}
const RTC_CONFIG = buildRtcConfig();

export class CMeetClient {
  private transport: SignalTransport | null = null;
  private peers = new Map<string, RemotePeer>();
  private localStream: MediaStream | null = null;
  private events: CMeetEvents;
  // Queue ICE candidates that arrive before the remote description is set.
  // Adding an ICE candidate with no remote description throws in every
  // browser, so the candidate silently disappears - which is why calls
  // sometimes come up with one-way audio/video.
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  // Peers we've heard are screen-sharing. Kept separately because the
  // signal arrives on a different channel message than the track itself.
  private sharingPeers = new Set<string>();
  // Our own screen-sharing state - broadcast after a renegotiation so other
  // peers can render the rectangular tile.
  private iAmSharing = false;
  // Perfect-negotiation bookkeeping, per peer. Without this an offer/answer
  // collision (both sides renegotiating at once - very common on ICE restart
  // or a screen-share swap) wedges the connection in `have-local-offer`.
  private nego = new Map<string, { makingOffer: boolean; ignoreOffer: boolean; settingRemoteAnswer: boolean }>();
  private senders = new Map<string, { audio: RTCRtpSender | null; video: RTCRtpSender | null }>();
  // Grace timers for `disconnected` peers - a brief blip is normal, so we wait
  // before spending an ICE restart on it.
  private recoverTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private audioCtx: AudioContext | null = null;
  private analysers = new Map<string, { analyser: AnalyserNode; buf: Uint8Array }>();
  private activeSpeaker: string | null = null;
  private lastStats = new Map<string, { lost: number; received: number }>();
  readonly peerId: string;
  readonly roomCode: string;
  readonly name: string;
  readonly memberId: string | null;
  readonly isOwner: boolean;
  private hostMemberId: string | null = null;
  private hostIsOwner = false;

  constructor(
    roomCode: string,
    peerId: string,
    name: string,
    events: CMeetEvents = {},
    identity: { memberId?: string | null; isOwner?: boolean; hostMemberId?: string | null; hostIsOwner?: boolean } = {},
  ) {
    this.roomCode = roomCode;
    this.peerId = peerId;
    this.name = name;
    this.events = events;
    this.memberId = identity.memberId || null;
    this.isOwner = !!identity.isOwner;
    this.hostMemberId = identity.hostMemberId || null;
    this.hostIsOwner = !!identity.hostIsOwner;
  }

  // Is the given peer the meeting host? Uses the identity info carried on
  // the join broadcast (memberId or isOwner) compared to what the room says.
  private isPeerHost(memberId: string | null, isOwner: boolean): boolean {
    if (this.hostIsOwner) return isOwner;
    if (this.hostMemberId) return !!memberId && memberId === this.hostMemberId;
    return false;
  }

  // Call once the caller has a MediaStream ready.
  async join(localStream: MediaStream): Promise<void> {
    this.localStream = localStream;

    // Open the signaling stream. The transport reconnects and resumes from its
    // own cursor, so a mobile network hand-off cannot lose an offer; there is
    // no subscribe handshake to time out and no retry ladder to tune here.
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const giveUp = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Couldn't reach the meeting server. Check your connection and refresh."));
      }, 15000);

      this.transport = openSignalTransport({
        roomCode: this.roomCode,
        peerId: this.peerId,
        onMessage: (payload) => {
          this.handleSignal(payload).catch(err => this.events.onError?.(String(err)));
        },
        onOpen: () => {
          if (settled) return;
          settled = true;
          clearTimeout(giveUp);
          resolve();
        },
        onError: (message) => this.events.onError?.(message),
      });
    });

    // Announce ourselves. Existing peers will reply with their own "join"
    // events; each peer uses the sort-order rule to decide who creates
    // the offer.
    this.send({
      type: "join",
      peerId: this.peerId,
      name: this.name,
      memberId: this.memberId,
      isOwner: this.isOwner,
      hasVideo: this.hasTrackKind("video"),
      hasAudio: this.hasTrackKind("audio"),
    });
  }

  async leave(): Promise<void> {
    this.send({ type: "leave", peerId: this.peerId });
    this.peers.forEach(p => { try { p.connection.close(); } catch { /* noop */ } });
    this.peers.forEach(p => this.cleanupPeerState(p.peerId));
    this.peers.clear();
    this.stopMonitors();
    this.analysers.clear();
    if (this.audioCtx) { try { await this.audioCtx.close(); } catch { /* noop */ } this.audioCtx = null; }
    this.events.onRemoteUpdate?.([]);
    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
  }

  // Host: ask everyone in the room to mute their mic. Each receiver
  // disables their own audio track but can unmute themselves afterwards
  // (matches Zoom/Meet "mute all" semantics).
  hostMuteAll() {
    this.send({ type: "host-mute-all", from: this.peerId, name: this.name, at: Date.now() });
  }

  // Host: end the meeting for everyone. Receivers leave automatically.
  hostEnd() {
    this.send({ type: "host-end", from: this.peerId, name: this.name, at: Date.now() });
  }

  // Host: remove a specific participant from the meeting. Takes a set of
  // peer IDs so the caller can kick every open tab the user has.
  hostKick(targetPeerIds: string[]) {
    // Broadcast the kick so the target's tab leaves gracefully...
    this.send({
      type: "host-kick",
      from: this.peerId,
      name: this.name,
      targets: targetPeerIds,
      at: Date.now(),
    });
    // ...AND tear the peer(s) down on our side immediately. If the target
    // is already in a failed/disconnected state they might never receive
    // the signal, but the host still expects them gone. Without this the
    // "Connection failed / Reconnecting" tile stayed forever after kick.
    this.forceRemovePeer(targetPeerIds);
  }

  // Close + evict peer(s) from the local mesh without waiting for any
  // remote acknowledgement. Safe to call on peers that don't exist.
  forceRemovePeer(targetPeerIds: string[]) {
    let changed = false;
    for (const pid of targetPeerIds) {
      const entry = this.peers.get(pid);
      if (!entry) continue;
      try { entry.connection.close(); } catch { /* noop */ }
      this.peers.delete(pid);
      this.sharingPeers.delete(pid);
      this.pendingIce.delete(pid);
      this.cleanupPeerState(pid);
      changed = true;
    }
    if (changed) this.emitRemotes();
  }

  sendChat(body: string) {
    this.send({
      type: "chat",
      from: this.peerId,
      name: this.name,
      body,
      at: Date.now(),
    });
    this.events.onChat?.({ from: this.peerId, name: this.name, body, at: Date.now(), self: true });
  }

  sendTranscript(text: string, lang: string, isFinal: boolean) {
    this.send({
      type: "transcript",
      from: this.peerId,
      name: this.name,
      text,
      lang,
      isFinal,
      at: Date.now(),
    });
  }

  // Replace the outgoing video track on every peer connection without
  // renegotiation. Used for screen-share toggle and cam/mic changes.
  async replaceVideoTrack(newTrack: MediaStreamTrack | null, opts: { sharing?: boolean } = {}) {
    if (newTrack) newTrack.contentHint = opts.sharing ? "detail" : "motion";
    await Promise.all(Array.from(this.peers.keys()).map(async peerId => {
      // Prefer the transceiver sender captured at setup: it exists even while
      // no track is attached, so a camera can be restored without an m-line
      // shuffle (which is what used to blank the tile after a screen share).
      const sender = this.senders.get(peerId)?.video
        || this.peers.get(peerId)?.connection.getSenders().find(s => s.track?.kind === "video")
        || null;
      if (sender) await sender.replaceTrack(newTrack);
    }));
    // Keep the stream used for newly joining peers current. Track lifetime
    // remains owned by the call UI so a camera can stay warm while a screen
    // is presented and be restored without another permission round-trip.
    if (this.localStream) {
      const existingVideo = this.localStream.getVideoTracks()[0];
      if (existingVideo) this.localStream.removeTrack(existingVideo);
      if (newTrack) this.localStream.addTrack(newTrack);
    }
    if (typeof opts.sharing === "boolean") {
      this.iAmSharing = opts.sharing;
      this.send({ type: "screen-state", from: this.peerId, sharing: opts.sharing });
    }
    // Re-apply the encoding ceiling: screen share and camera have very
    // different bitrate/framerate needs.
    this.applyEncodings();
  }

  /** Swap the outgoing mic track everywhere (device change) without renegotiating. */
  async replaceAudioTrack(newTrack: MediaStreamTrack | null) {
    await Promise.all(Array.from(this.senders.values()).map(async s => {
      if (s.audio) await s.audio.replaceTrack(newTrack);
    }));
    if (this.localStream) {
      const existing = this.localStream.getAudioTracks()[0];
      if (existing) this.localStream.removeTrack(existing);
      if (newTrack) this.localStream.addTrack(newTrack);
    }
  }

  // ---- Private ----

  private send(payload: any) {
    if (!this.transport) return;
    // `to` doubles as the server-side address so a targeted message is never
    // fanned out to the whole room; the payload keeps it for the old handler.
    this.transport.send(payload, payload?.to ?? null);
  }

  private hasTrackKind(kind: "video" | "audio"): boolean {
    return (this.localStream?.getTracks() || []).some(t => t.kind === kind && t.enabled);
  }

  private emitRemotes() {
    this.events.onRemoteUpdate?.(Array.from(this.peers.values()));
  }

  private async flushPendingIce(peerId: string, pc: RTCPeerConnection) {
    const q = this.pendingIce.get(peerId);
    if (!q || q.length === 0) return;
    for (const c of q) {
      try { await pc.addIceCandidate(c); } catch { /* noop */ }
    }
    this.pendingIce.delete(peerId);
  }

  private async handleSignal(msg: any) {
    if (!msg || !msg.type) return;
    // Ignore our own broadcasts (we're relying on broadcast.self=false, but
    // double-check to be safe).
    if ("from" in msg && msg.from === this.peerId) return;
    if ("peerId" in msg && msg.peerId === this.peerId && msg.type !== "chat") return;
    if ("to" in msg && msg.to !== this.peerId) return;

    switch (msg.type) {
      case "join": {
        // Reply with our presence so the new peer knows about us
        this.send({
          type: "join-ack",
          peerId: this.peerId,
          name: this.name,
          memberId: this.memberId,
          isOwner: this.isOwner,
          hasVideo: this.hasTrackKind("video"),
          hasAudio: this.hasTrackKind("audio"),
          to: msg.peerId,
        });
        const identity = {
          memberId: msg.memberId || null,
          isOwner: !!msg.isOwner,
          hasVideo: !!msg.hasVideo,
          hasAudio: !!msg.hasAudio,
        };
        if (this.peerId > msg.peerId) {
          await this.ensureConnection(msg.peerId, msg.name, /* initiator */ true, identity);
        } else {
          await this.ensureConnection(msg.peerId, msg.name, /* initiator */ false, identity);
        }
        break;
      }
      case "join-ack": {
        const identity = {
          memberId: msg.memberId || null,
          isOwner: !!msg.isOwner,
          hasVideo: !!msg.hasVideo,
          hasAudio: !!msg.hasAudio,
        };
        if (this.peerId > msg.peerId) {
          await this.ensureConnection(msg.peerId, msg.name, true, identity);
        } else {
          await this.ensureConnection(msg.peerId, msg.name, false, identity);
        }
        break;
      }
      case "offer": {
        const pc = await this.ensureConnection(msg.from, msg.name || "Peer", false);
        const st = this.nego.get(msg.from);
        // Perfect negotiation: if we have an offer of our own in flight, only
        // the polite peer rolls back. The impolite peer ignores the incoming
        // offer and its own offer wins - no deadlock either way.
        // `msg.polite` is the sender's view of us, so we are polite when it says so.
        const weArePolite = msg.polite !== false;
        const collision = !!st && (st.makingOffer || pc.signalingState !== "stable");
        if (st) st.ignoreOffer = collision && !weArePolite;
        if (st?.ignoreOffer) break;
        if (collision) {
          await Promise.all([
            pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit).catch(() => { /* noop */ }),
            pc.setRemoteDescription({ type: "offer", sdp: msg.sdp }),
          ]);
        } else {
          await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        }
        await this.flushPendingIce(msg.from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.applyEncodings();
        this.send({ type: "answer", from: this.peerId, to: msg.from, sdp: tuneSdp(answer.sdp || "") });
        // If we were already sharing when this peer joined, let them know
        // so they render our tile as the big rectangle from the start.
        if (this.iAmSharing) {
          this.send({ type: "screen-state", from: this.peerId, sharing: true, to: msg.from });
        }
        break;
      }
      case "answer": {
        const peer = this.peers.get(msg.from);
        if (peer) {
          // An answer that arrives after a rollback no longer applies; ignore
          // it instead of throwing an InvalidStateError that kills the call.
          if (peer.connection.signalingState !== "have-local-offer") break;
          const st = this.nego.get(msg.from);
          if (st) st.settingRemoteAnswer = true;
          try {
            await peer.connection.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          } finally {
            if (st) st.settingRemoteAnswer = false;
          }
          await this.flushPendingIce(msg.from, peer.connection);
          this.applyEncodings();
        }
        break;
      }
      case "ice": {
        if (!msg.candidate) break;
        const peer = this.peers.get(msg.from);
        // Buffer ICE candidates that arrive before remote description is
        // set. Without this buffer, addIceCandidate throws and the candidate
        // is lost - the classic "peer connects but no media" failure.
        if (!peer || !peer.connection.remoteDescription) {
          const q = this.pendingIce.get(msg.from) || [];
          q.push(msg.candidate);
          this.pendingIce.set(msg.from, q);
          break;
        }
        try { await peer.connection.addIceCandidate(msg.candidate); }
        catch { if (!this.nego.get(msg.from)?.ignoreOffer) { /* transient - candidate will be resent */ } }
        break;
      }
      case "screen-state": {
        if (msg.sharing) this.sharingPeers.add(msg.from);
        else this.sharingPeers.delete(msg.from);
        const p = this.peers.get(msg.from);
        if (p) p.isSharingScreen = !!msg.sharing;
        this.emitRemotes();
        break;
      }
      case "leave": {
        const p = this.peers.get(msg.peerId);
        if (p) { try { p.connection.close(); } catch { /* noop */ } }
        this.peers.delete(msg.peerId);
        this.sharingPeers.delete(msg.peerId);
        this.pendingIce.delete(msg.peerId);
        this.cleanupPeerState(msg.peerId);
        this.applyEncodings();
        this.emitRemotes();
        break;
      }
      case "chat": {
        this.events.onChat?.({ from: msg.from, name: msg.name, body: msg.body, at: msg.at });
        break;
      }
      case "transcript": {
        this.events.onTranscript?.({
          from: msg.from, name: msg.name, text: msg.text,
          lang: msg.lang, isFinal: !!msg.isFinal, at: msg.at || Date.now(),
        });
        break;
      }
      case "host-mute-all": {
        this.events.onHostMuteAll?.(msg.name || msg.from);
        break;
      }
      case "host-end": {
        this.events.onHostEnd?.(msg.name || msg.from);
        break;
      }
      case "host-kick": {
        // Host kick is targeted at specific peerIds. Every other peer
        // ignores the signal; only matches fire onHostKicked → leave.
        const targets: string[] = Array.isArray(msg.targets) ? msg.targets : [];
        if (targets.includes(this.peerId)) {
          this.events.onHostKicked?.(msg.name || msg.from);
        }
        break;
      }
    }
  }

  private async ensureConnection(
    peerId: string,
    name: string,
    initiator: boolean,
    identity: { memberId: string | null; isOwner: boolean; hasVideo?: boolean; hasAudio?: boolean } = { memberId: null, isOwner: false },
  ): Promise<RTCPeerConnection> {
    let entry = this.peers.get(peerId);
    if (entry) return entry.connection;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const remoteStream = new MediaStream();
    // The impolite peer (the one that creates the first offer) wins collisions.
    const polite = !initiator;
    const state = { makingOffer: false, ignoreOffer: false, settingRemoteAnswer: false };
    this.nego.set(peerId, state);

    pc.onicecandidate = e => {
      if (e.candidate) {
        this.send({ type: "ice", from: this.peerId, to: peerId, candidate: e.candidate });
      }
    };
    pc.ontrack = e => {
      e.streams[0]?.getTracks().forEach(t => {
        if (!remoteStream.getTracks().find(rt => rt.id === t.id)) remoteStream.addTrack(t);
      });
      // A track ending (peer turned the camera off) should repaint the tile.
      e.track.onended = () => {
        try { remoteStream.removeTrack(e.track); } catch { /* noop */ }
        this.emitRemotes();
      };
      if (e.track.kind === "audio") this.watchAudioLevel(peerId, remoteStream);
      this.emitRemotes();
    };
    // Renegotiate whenever the set of tracks changes (camera restored after a
    // screen share, mic added late, ICE restart).
    pc.onnegotiationneeded = async () => {
      const st = this.nego.get(peerId);
      if (!st) return;
      try {
        st.makingOffer = true;
        await pc.setLocalDescription();
        this.send({ type: "offer", from: this.peerId, to: peerId, name: this.name, polite: !polite, sdp: tuneSdp(pc.localDescription?.sdp || "") });
      } catch { /* noop */ } finally {
        st.makingOffer = false;
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") this.iceRestart(peerId).catch(() => { /* noop */ });
    };
    pc.onconnectionstatechange = () => {
      const connState = pc.connectionState as PeerConnectionState;
      this.events.onPeerStateChange?.(peerId, connState);
      const timer = this.recoverTimers.get(peerId);
      if (timer && connState !== "disconnected") { clearTimeout(timer); this.recoverTimers.delete(peerId); }
      if (connState === "disconnected" && !timer) {
        // Most `disconnected` blips heal themselves within a couple of
        // seconds; only restart ICE if it is still down after the grace window.
        this.recoverTimers.set(peerId, setTimeout(() => {
          this.recoverTimers.delete(peerId);
          if (pc.connectionState === "disconnected") this.iceRestart(peerId).catch(() => { /* noop */ });
        }, 2500));
      }
      if (connState === "failed") {
        this.iceRestart(peerId).catch(() => { /* noop */ });
      }
      if (connState === "closed") {
        this.cleanupPeerState(peerId);
        this.peers.delete(peerId);
        this.emitRemotes();
      }
    };

    // Use explicit transceivers so a sender exists even before a track does -
    // that keeps m-line order stable across renegotiation and lets us swap a
    // camera in later without a fresh offer/answer round trip.
    const audioTrack = this.localStream?.getAudioTracks()[0] || null;
    const videoTrack = this.localStream?.getVideoTracks()[0] || null;
    if (videoTrack && !videoTrack.contentHint) videoTrack.contentHint = this.iAmSharing ? "detail" : "motion";
    const audioTx = pc.addTransceiver(audioTrack || "audio", {
      direction: "sendrecv",
      streams: this.localStream ? [this.localStream] : [],
      sendEncodings: [{ maxBitrate: AUDIO_MAX_BITRATE }],
    });
    const videoTx = pc.addTransceiver(videoTrack || "video", {
      direction: "sendrecv",
      streams: this.localStream ? [this.localStream] : [],
    });
    this.senders.set(peerId, { audio: audioTx.sender, video: videoTx.sender });

    entry = {
      peerId, name, stream: remoteStream,
      quality: "good",
      hasVideo: identity.hasVideo !== false,
      hasAudio: identity.hasAudio !== false,
      isSharingScreen: this.sharingPeers.has(peerId),
      memberId: identity.memberId,
      isOwner: identity.isOwner,
      isHost: this.isPeerHost(identity.memberId, identity.isOwner),
      connection: pc,
    };
    this.peers.set(peerId, entry);
    this.emitRemotes();
    this.applyEncodings();
    this.startMonitors();

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send({ type: "offer", from: this.peerId, to: peerId, name: this.name, polite: !polite, sdp: tuneSdp(offer.sdp || "") });
    }

    return pc;
  }

  /* ---------- Quality control ---------- */

  /** Push the current bitrate/framerate ceiling onto every video sender. */
  private applyEncodings() {
    const profile = profileFor(this.peers.size, this.iAmSharing);
    for (const [, s] of this.senders) {
      const sender = s.video;
      if (!sender) continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = profile.maxBitrate;
        params.encodings[0].maxFramerate = profile.maxFramerate;
        params.encodings[0].scaleResolutionDownBy = profile.scaleDown;
        // Screen share must stay legible; a camera may drop resolution instead
        // of turning into a slideshow.
        params.degradationPreference = this.iAmSharing ? "maintain-resolution" : "balanced";
        void sender.setParameters(params);
      } catch { /* not supported everywhere - safe to skip */ }
    }
  }

  /** Sample getStats() so the UI can flag a weak link before it drops. */
  private startMonitors() {
    if (!this.statsTimer) {
      this.statsTimer = setInterval(() => { void this.sampleStats(); }, 4000);
    }
    if (!this.levelTimer) {
      this.levelTimer = setInterval(() => this.sampleLevels(), 400);
    }
  }

  private stopMonitors() {
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    if (this.levelTimer) { clearInterval(this.levelTimer); this.levelTimer = null; }
  }

  private async sampleStats() {
    for (const [peerId, peer] of this.peers) {
      try {
        const report = await peer.connection.getStats();
        let lost = 0, received = 0, rtt = 0, jitter = 0;
        report.forEach((stat: any) => {
          if (stat.type === "inbound-rtp" && !stat.isRemote) {
            lost += Number(stat.packetsLost || 0);
            received += Number(stat.packetsReceived || 0);
            jitter = Math.max(jitter, Number(stat.jitter || 0));
          }
          if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.currentRoundTripTime != null) {
            rtt = Math.max(rtt, Number(stat.currentRoundTripTime));
          }
        });
        // Loss is cumulative, so compare against the previous sample.
        const prev = this.lastStats.get(peerId) || { lost: 0, received: 0 };
        const dLost = Math.max(0, lost - prev.lost);
        const dRecv = Math.max(0, received - prev.received);
        this.lastStats.set(peerId, { lost, received });
        const lossRate = dRecv + dLost > 0 ? dLost / (dRecv + dLost) : 0;
        const quality: ConnectionQuality =
          lossRate > 0.08 || rtt > 0.5 || jitter > 0.15 ? "poor"
            : lossRate > 0.03 || rtt > 0.3 || jitter > 0.05 ? "fair"
              : "good";
        if (peer.quality !== quality) {
          peer.quality = quality;
          this.events.onQuality?.(peerId, quality);
          this.emitRemotes();
        }
      } catch { /* noop */ }
    }
  }

  /** Web Audio meter per remote stream, used for active-speaker switching. */
  private watchAudioLevel(peerId: string, stream: MediaStream) {
    if (this.analysers.has(peerId)) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx = this.audioCtx || new Ctx();
      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      this.analysers.set(peerId, { analyser, buf: new Uint8Array(analyser.frequencyBinCount) });
    } catch { /* audio metering is a nicety, never fatal */ }
  }

  private sampleLevels() {
    if (!this.analysers.size) return;
    let loudest: string | null = null;
    let best = 0;
    for (const [peerId, { analyser, buf }] of this.analysers) {
      if (!this.peers.has(peerId)) continue;
      analyser.getByteFrequencyData(buf as any);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length) / 255;
      if (rms > best) { best = rms; loudest = peerId; }
    }
    // Threshold keeps keyboard clicks and room tone from stealing the stage.
    const next = best > 0.045 ? loudest : this.activeSpeaker;
    if (next !== this.activeSpeaker) {
      this.activeSpeaker = next;
      this.events.onActiveSpeaker?.(next);
    }
  }

  private cleanupPeerState(peerId: string) {
    const timer = this.recoverTimers.get(peerId);
    if (timer) { clearTimeout(timer); this.recoverTimers.delete(peerId); }
    this.nego.delete(peerId);
    this.senders.delete(peerId);
    this.analysers.delete(peerId);
    this.lastStats.delete(peerId);
    if (this.activeSpeaker === peerId) {
      this.activeSpeaker = null;
      this.events.onActiveSpeaker?.(null);
    }
  }

  private async iceRestart(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (peer.connection.signalingState !== "stable") return;
    try {
      const offer = await peer.connection.createOffer({ iceRestart: true });
      await peer.connection.setLocalDescription(offer);
      this.send({ type: "offer", from: this.peerId, to: peerId, name: this.name, polite: true, sdp: tuneSdp(offer.sdp || "") });
    } catch {
      /* ignore - will try again on next failure */
    }
  }
}
