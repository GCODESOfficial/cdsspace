/* eslint-disable @typescript-eslint/no-explicit-any */
// Full-mesh WebRTC with Supabase Realtime signaling.
// Every peer has 1 RTCPeerConnection per other peer. Peer A creates the
// offer when its peerId sorts lexicographically greater than peer B's —
// that rule prevents both sides from creating offers simultaneously.
//
// Signaling messages are exchanged via a Supabase Realtime channel named
// `cmeet:<roomCode>`. Message shapes:
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

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

// Use the public Supabase client (anon key) — Realtime only needs it.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export type RemotePeer = {
  peerId: string;
  name: string;
  stream: MediaStream;
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
};

// ICE configuration. Always includes free Google STUN servers. When the
// self-hosted TURN relay is configured (see deploy/coturn/), it's added
// so peers behind symmetric NAT / corporate firewalls can connect too.
// Zero third-party dependency — the TURN server runs on your own VPS.
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
    // on port 3478 — covers networks that block non-443 UDP.
    if (turnUrl.includes(":3478")) {
      servers.push({
        urls: turnUrl.replace("turn:", "turns:").replace(":3478", ":5349"),
        username: turnUser,
        credential: turnCred,
      });
    }
  }
  return { iceServers: servers, iceTransportPolicy: "all", bundlePolicy: "max-bundle" };
}
const RTC_CONFIG = buildRtcConfig();

export class CMeetClient {
  private supa = createClient(url, anon);
  private channel: RealtimeChannel | null = null;
  private peers = new Map<string, RemotePeer>();
  private localStream: MediaStream | null = null;
  private events: CMeetEvents;
  // Queue ICE candidates that arrive before the remote description is set.
  // Adding an ICE candidate with no remote description throws in every
  // browser, so the candidate silently disappears — which is why calls
  // sometimes come up with one-way audio/video.
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  // Peers we've heard are screen-sharing. Kept separately because the
  // signal arrives on a different channel message than the track itself.
  private sharingPeers = new Set<string>();
  // Our own screen-sharing state — broadcast after a renegotiation so other
  // peers can render the rectangular tile.
  private iAmSharing = false;
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

    // Grab fresh TURN/STUN creds before the first peer connection is made.
    // Retry subscribe up to 5 times with exponential-ish backoff. Supabase
    // Realtime frequently takes >8s to come up on cold connections (first
    // tab load, mobile data hand-off, etc.) — three attempts at 8s each
    // wasn't enough, so calls timed out even though Realtime was fine.
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      let ch: RealtimeChannel | null = null;
      try {
        ch = this.supa.channel(`cmeet:${this.roomCode}`, {
          config: { broadcast: { self: false, ack: false } },
        });
        ch.on("broadcast", { event: "signal" }, ({ payload }: any) => {
          this.handleSignal(payload).catch(err => this.events.onError?.(String(err)));
        });

        // Give the socket longer on the first couple of tries to avoid a
        // false TIMED_OUT on slow networks.
        const timeoutMs = attempt <= 2 ? 15000 : 10000;

        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("TIMED_OUT")), timeoutMs);
          ch!.subscribe(status => {
            if (status === "SUBSCRIBED") { clearTimeout(t); resolve(); }
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(t); reject(new Error(status)); }
            else if (status === "CLOSED") { clearTimeout(t); reject(new Error("CLOSED")); }
          });
        });

        this.channel = ch;
        lastError = null;
        break;
      } catch (err: any) {
        lastError = String(err?.message || err || "subscribe failed");
        // Always tear down the half-connected channel before retrying,
        // otherwise supabase-js leaks state and the next attempt fails
        // even faster.
        try { if (ch) await this.supa.removeChannel(ch); } catch { /* noop */ }
        // Backoff: 600ms, 1.2s, 2.4s, 4s, 6s
        const delay = Math.min(6000, 600 * Math.pow(1.8, attempt - 1));
        await new Promise(r => setTimeout(r, delay));
      }
    }

    if (lastError) {
      throw new Error(`Couldn't connect to the meeting (${lastError}). Make sure Realtime is enabled on this Supabase project, then refresh and try again.`);
    }

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
    this.peers.clear();
    this.events.onRemoteUpdate?.([]);
    if (this.channel) {
      try { await this.channel.unsubscribe(); } catch { /* noop */ }
      this.channel = null;
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
    this.peers.forEach(p => {
      const sender = p.connection.getSenders().find(s => s.track?.kind === "video");
      if (sender) sender.replaceTrack(newTrack);
    });
    // Update the local stream so the UI preview reflects it
    if (this.localStream) {
      const existingVideo = this.localStream.getVideoTracks()[0];
      if (existingVideo) {
        this.localStream.removeTrack(existingVideo);
        try { existingVideo.stop(); } catch { /* noop */ }
      }
      if (newTrack) this.localStream.addTrack(newTrack);
    }
    if (typeof opts.sharing === "boolean") {
      this.iAmSharing = opts.sharing;
      this.send({ type: "screen-state", from: this.peerId, sharing: opts.sharing });
    }
  }

  // ---- Private ----

  private send(payload: any) {
    if (!this.channel) return;
    this.channel.send({ type: "broadcast", event: "signal", payload }).catch(() => { /* noop */ });
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
        await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        await this.flushPendingIce(msg.from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({ type: "answer", from: this.peerId, to: msg.from, sdp: answer.sdp });
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
          await peer.connection.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          await this.flushPendingIce(msg.from, peer.connection);
        }
        break;
      }
      case "ice": {
        if (!msg.candidate) break;
        const peer = this.peers.get(msg.from);
        // Buffer ICE candidates that arrive before remote description is
        // set. Without this buffer, addIceCandidate throws and the candidate
        // is lost — the classic "peer connects but no media" failure.
        if (!peer || !peer.connection.remoteDescription) {
          const q = this.pendingIce.get(msg.from) || [];
          q.push(msg.candidate);
          this.pendingIce.set(msg.from, q);
          break;
        }
        try { await peer.connection.addIceCandidate(msg.candidate); } catch { /* noop */ }
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

    pc.onicecandidate = e => {
      if (e.candidate) {
        this.send({ type: "ice", from: this.peerId, to: peerId, candidate: e.candidate });
      }
    };
    pc.ontrack = e => {
      e.streams[0]?.getTracks().forEach(t => {
        if (!remoteStream.getTracks().find(rt => rt.id === t.id)) remoteStream.addTrack(t);
      });
      this.emitRemotes();
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as PeerConnectionState;
      this.events.onPeerStateChange?.(peerId, state);
      if (state === "failed") {
        // Try to recover with an ICE restart before giving up. Works only on
        // the initiator side (the passive peer gets a fresh offer).
        if (initiator) {
          this.iceRestart(peerId).catch(() => { /* noop */ });
        }
      }
      if (["closed"].includes(state)) {
        this.peers.delete(peerId);
        this.emitRemotes();
      }
    };

    // Add our local tracks
    this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    entry = {
      peerId, name, stream: remoteStream,
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

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send({ type: "offer", from: this.peerId, to: peerId, name: this.name, sdp: offer.sdp });
    }

    return pc;
  }

  private async iceRestart(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    try {
      const offer = await peer.connection.createOffer({ iceRestart: true });
      await peer.connection.setLocalDescription(offer);
      this.send({ type: "offer", from: this.peerId, to: peerId, name: this.name, sdp: offer.sdp });
    } catch {
      /* ignore — will try again on next failure */
    }
  }
}
