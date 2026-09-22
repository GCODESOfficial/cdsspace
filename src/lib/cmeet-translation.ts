"use client";

import { guestTokenFromUrl } from "@/lib/cmeet-admission";

/**
 * Only languages the live speech-to-speech service can actually both hear and
 * speak. Hausa, Yoruba and Igbo were offered here and could not be delivered:
 * picking one produced no translated audio, which reads to the listener as the
 * feature being broken rather than the language being unavailable. A language
 * belongs in this list only once it works end to end.
 */
export const CMEET_LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "de", label: "German" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "ru", label: "Russian" },
  { code: "nl", label: "Dutch" },
  { code: "rw", label: "Kinyarwanda" },
  { code: "sw", label: "Swahili" },
] as const;

export type CMeetLanguageCode = (typeof CMEET_LANGUAGES)[number]["code"];

export type CMeetTranslationPreferences = {
  enabled: boolean;
  spokenLanguage: CMeetLanguageCode;
  heardLanguage: Exclude<CMeetLanguageCode, "auto">;
  captions: boolean;
  volume: number;
};

export const DEFAULT_TRANSLATION_PREFERENCES: CMeetTranslationPreferences = {
  enabled: false,
  spokenLanguage: "auto",
  heardLanguage: "en",
  captions: true,
  volume: 0.85,
};

export function isCMeetLanguage(value: unknown): value is CMeetLanguageCode {
  return CMEET_LANGUAGES.some((language) => language.code === value);
}

export function languageBadge(code: string) {
  return code === "auto" ? "AUTO" : code.toUpperCase();
}

/**
 * The language the person has already told us they read the site in.
 *
 * Set from the accessibility widget (and stored under the same key the site
 * translation engine uses), so nobody has to choose their language twice. Every
 * locale the site offers is also a language the meeting can be translated into.
 */
export function accessibilityLanguage(): Exclude<CMeetLanguageCode, "auto"> | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem("cds.lang");
    if (!stored) return null;
    const code = stored.split("-")[0].toLowerCase();
    return isCMeetLanguage(code) && code !== "auto" ? code : null;
  } catch {
    return null;
  }
}

function preferenceStorageKey(roomCode: string) {
  return `cds.cmeet.translation.${roomCode}`;
}

/**
 * Translation preferences are deliberately scoped to this meeting tab. A
 * listener changing their target language must never change another cMeet tab
 * (or another signed-in person using the same browser profile).
 */
export function loadCMeetTranslationPreferences(roomCode: string): CMeetTranslationPreferences {
  if (typeof window === "undefined") return DEFAULT_TRANSLATION_PREFERENCES;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(preferenceStorageKey(roomCode)) || "{}") as Partial<CMeetTranslationPreferences>;
    const savedHeardLanguage: unknown = parsed.heardLanguage;
    // A choice made in this meeting wins. Otherwise fall back to the language
    // the site is already being read in, and only then to English.
    const heardLanguage = isCMeetLanguage(savedHeardLanguage) && savedHeardLanguage !== "auto"
      ? savedHeardLanguage
      : accessibilityLanguage() || DEFAULT_TRANSLATION_PREFERENCES.heardLanguage;
    return {
      enabled: Boolean(parsed.enabled),
      spokenLanguage: isCMeetLanguage(parsed.spokenLanguage) ? parsed.spokenLanguage : "auto",
      heardLanguage,
      captions: parsed.captions !== false,
      volume: typeof parsed.volume === "number" ? Math.min(1, Math.max(0, parsed.volume)) : 0.85,
    };
  } catch {
    return { ...DEFAULT_TRANSLATION_PREFERENCES, heardLanguage: accessibilityLanguage() || DEFAULT_TRANSLATION_PREFERENCES.heardLanguage };
  }
}

export function saveCMeetTranslationPreferences(roomCode: string, preferences: CMeetTranslationPreferences) {
  try {
    window.sessionStorage.setItem(preferenceStorageKey(roomCode), JSON.stringify(preferences));
  } catch {
    // Private browsing and embedded webviews may disable storage.
  }
}

type TranslationSecretPayload = {
  value?: string;
  expires_at?: number;
  error?: string;
};

const translationSecretCache = new Map<string, {
  value?: string;
  expiresAt?: number;
  pending?: Promise<string>;
}>();

function translationSecretKey(roomCode: string, listenerPeerId: string, targetLanguage: string) {
  return `${roomCode}:${listenerPeerId}:${targetLanguage}`;
}

async function getTranslationSecret({
  roomCode,
  listenerPeerId,
  targetLanguage,
}: {
  roomCode: string;
  listenerPeerId: string;
  targetLanguage: string;
}) {
  const key = translationSecretKey(roomCode, listenerPeerId, targetLanguage);
  const cached = translationSecretCache.get(key);
  const now = Math.floor(Date.now() / 1000);
  if (cached?.value && (cached.expiresAt || 0) > now + 15) return cached.value;
  if (cached?.pending) return cached.pending;

  const pending = (async () => {
    const response = await fetch(`/api/cmeet/${encodeURIComponent(roomCode)}/translation/session`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        peerId: listenerPeerId,
        targetLanguage,
        // The same reader admission uses, so a mid-call secret refresh can
        // never disagree with how this guest was let in.
        guestToken: guestTokenFromUrl(),
      }),
    });
    const payload = await response.json().catch(() => ({})) as TranslationSecretPayload;
    if (!response.ok || !payload.value) {
      throw new Error(payload.error || "Live translation is unavailable.");
    }
    translationSecretCache.set(key, {
      value: payload.value,
      expiresAt: payload.expires_at || now + 540,
    });
    return payload.value;
  })();
  translationSecretCache.set(key, { pending });
  try {
    return await pending;
  } catch (error) {
    translationSecretCache.delete(key);
    throw error;
  }
}

/**
 * A translation secret can create multiple translation sessions until it
 * expires. Warm it as soon as a listener is admitted so the first word from a
 * newly connected speaker does not wait on a server round trip.
 */
export async function warmCMeetTranslation({
  roomCode,
  listenerPeerId,
  targetLanguage,
}: {
  roomCode: string;
  listenerPeerId: string;
  targetLanguage: string;
}) {
  await getTranslationSecret({ roomCode, listenerPeerId, targetLanguage });
}

export type SpeechGateState = { relaying: boolean; quietSince: number };

/**
 * Should the relayed copy carry audio right now?
 *
 * Pure so the behaviour that matters - never latching shut - can be tested
 * without a live call, a microphone or a browser.
 */
export function nextSpeechGateState(
  input: { contextRunning: boolean; level: number; now: number },
  state: SpeechGateState,
): SpeechGateState {
  // A context that is not running reports silence no matter how loud the
  // speaker is. Preserve the last known state until measurement resumes. In
  // particular, a newly-created gate must not fail open and feed room noise to
  // the translator while Safari is still resuming its AudioContext.
  if (!input.contextRunning) return state;
  if (input.level >= SPEECH_GATE_LEVEL) return { relaying: true, quietSince: 0 };
  const quietSince = state.quietSince || input.now;
  const quietFor = input.now - quietSince;
  return { relaying: state.relaying ? quietFor < SPEECH_GATE_HOLD_MS : false, quietSince };
}

/**
 * Roughly -49 dBFS. Browser echo cancellation and the translation service's
 * far-field denoiser run before/after this guard, so this remains sensitive to
 * quiet speech while rejecting the low room noise that caused repeated phantom
 * captions and spoken "thanks for watching"-style artefacts.
 */
const SPEECH_GATE_LEVEL = 0.0035;
/** A brief hold keeps natural syllable gaps while ending turns promptly. */
const SPEECH_GATE_HOLD_MS = 750;
const SPEECH_GATE_INTERVAL_MS = 50;

type BrowserAudioContext = AudioContext & {
  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode;
};

let translationAudioContext: BrowserAudioContext | null = null;

/** The page's single translation AudioContext, created on first use. */
function ensureTranslationAudioContext(): BrowserAudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!translationAudioContext || translationAudioContext.state === "closed") {
    translationAudioContext = new AudioContextConstructor({ latencyHint: "interactive" }) as BrowserAudioContext;
  }
  return translationAudioContext;
}

/** Call synchronously from a user gesture so Safari/iOS permits later audio. */
export function primeCMeetTranslationPlayback() {
  const context = ensureTranslationAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

type TranslationSidecarOptions = {
  roomCode: string;
  listenerPeerId: string;
  sourceStream: MediaStream;
  targetLanguage: string;
  volume: number;
  onTranscript?: (text: string, final: boolean) => void;
  onState?: (state: "connecting" | "live" | "unavailable") => void;
};

/**
 * One remote speaker -> one listener language. The source audio remains on the
 * existing cMeet peer connection; this independent WebRTC connection sends a
 * copy to OpenAI and only receives translated speech and transcript events.
 */
export class CMeetTranslationSidecar {
  private connection: RTCPeerConnection | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private audioGain: GainNode | null = null;
  private relayTrack: MediaStreamTrack | null = null;
  private transcriptIdleTimer: number | null = null;
  private trackReadyTimer: number | null = null;
  /** Every element this sidecar has ever attached, so none can be left playing. */
  private playbackElements = new Set<HTMLAudioElement>();
  private readyResolver: (() => void) | null = null;
  private speechGate: { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; timer: number } | null = null;
  private stopped = false;
  private options: TranslationSidecarOptions;

  constructor(options: TranslationSidecarOptions) {
    this.options = options;
  }

  async start() {
    const sourceTrack = this.options.sourceStream.getAudioTracks().find((track) => track.readyState === "live");
    if (!sourceTrack) throw new Error("The participant does not have a live audio track.");
    this.options.onState?.("connecting");
    try {
      const clientSecret = await getTranslationSecret({
        roomCode: this.options.roomCode,
        listenerPeerId: this.options.listenerPeerId,
        targetLanguage: this.options.targetLanguage,
      });
      if (this.stopped) return;

      const connection = new RTCPeerConnection({
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceCandidatePoolSize: 2,
      });
      this.connection = connection;
      // Never move or modify the original cMeet receiver track. A clone keeps
      // this listener's translation session isolated from meeting playback.
      const relayTrack = sourceTrack.clone();
      relayTrack.contentHint = "speech";
      this.relayTrack = relayTrack;
      connection.addTrack(relayTrack, new MediaStream([relayTrack]));
      // Measured on the speaker's own stream, so the gate reads the real voice
      // rather than the copy it is muting.
      this.startSpeechGate(this.options.sourceStream, relayTrack);

      const translatedTrackReady = new Promise<void>((resolve) => {
        this.readyResolver = resolve;
      });

      connection.ontrack = ({ track, streams, receiver }) => {
        // ontrack fires again on renegotiation, and each firing used to append
        // another <audio> to the body while only the newest was remembered. The
        // older element kept playing translated speech with nothing able to
        // stop it, which is heard as the call talking to itself after the
        // speaker has finished. Tear down whatever is already playing first.
        this.teardownPlayback();
        // Ask supporting browsers for the smallest practical playout buffer.
        // This reduces audio lag without introducing a manual PCM pipeline.
        const lowLatencyReceiver = receiver as RTCRtpReceiver & { playoutDelayHint?: number };
        if ("playoutDelayHint" in lowLatencyReceiver) lowLatencyReceiver.playoutDelayHint = 0;
        // Safari can omit `streams` for a valid remote track. Build a stream
        // from the track in that case instead of silently dropping playback.
        const translatedStream = streams[0] || new MediaStream([track]);

        // Use the native MediaStream audio path first. This is the browser
        // playback route in OpenAI's WebRTC translation example and is the
        // most reliable route on Safari/iOS. The primed Web Audio context below
        // remains a fallback when autoplay policy rejects the media element.
        const audio = new Audio();
        audio.autoplay = true;
        audio.preload = "auto";
        audio.setAttribute("playsinline", "");
        audio.volume = this.options.volume;
        audio.srcObject = translatedStream;
        document.body.appendChild(audio);
        this.audio = audio;
        this.playbackElements.add(audio);
        this.readyResolver?.();
        this.readyResolver = null;
        void audio.play().then(() => {
          // The original speaker is muted only after this promise resolves.
          // Merely receiving a track is not proof that autoplay succeeded.
          if (!this.stopped) this.options.onState?.("live");
        }).catch(() => {
          if (this.stopped) return;
          try {
            audio.pause();
            audio.srcObject = null;
            audio.remove();
          } catch { /* already detached */ }
          this.playbackElements.delete(audio);
          if (this.audio === audio) this.audio = null;

          const context = translationAudioContext;
          if (!context || context.state === "closed") {
            this.options.onState?.("unavailable");
            return;
          }
          const activateFallback = async () => {
            if (context.state === "suspended") await context.resume();
            if (context.state !== "running" || this.stopped) throw new Error("Audio playback is suspended.");
            this.audioSource?.disconnect();
            this.audioGain?.disconnect();
            const source = context.createMediaStreamSource(translatedStream);
            const gain = context.createGain();
            gain.gain.value = this.options.volume;
            source.connect(gain).connect(context.destination);
            this.audioSource = source;
            this.audioGain = gain;
            this.options.onState?.("live");
          };
          void activateFallback().catch(() => {
            this.options.onState?.("unavailable");
          });
        });
      };
      connection.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(connection.connectionState)) this.options.onState?.("unavailable");
      };

      const events = connection.createDataChannel("oai-events");
      events.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(String(data)) as { type?: string; delta?: string };
          if (event.type === "session.output_transcript.delta" && event.delta) {
            this.options.onTranscript?.(event.delta, false);
            // Translation transcript events are an append-only delta stream;
            // there is no documented `done` event. Treat a short idle gap as
            // the end of the utterance so captions cannot grow forever.
            if (this.transcriptIdleTimer !== null) window.clearTimeout(this.transcriptIdleTimer);
            this.transcriptIdleTimer = window.setTimeout(() => {
              this.transcriptIdleTimer = null;
              if (!this.stopped) this.options.onTranscript?.("", true);
            }, 900);
          }
          if (event.type === "error") this.options.onState?.("unavailable");
        } catch {
          // Ignore non-JSON transport diagnostics.
        }
      };

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/translations/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: connection.localDescription?.sdp || offer.sdp || "",
      });
      if (!sdpResponse.ok) throw new Error("The translation audio connection could not start.");
      if (this.stopped) return;
      await connection.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
      await Promise.race([
        translatedTrackReady,
        new Promise<never>((_resolve, reject) => {
          this.trackReadyTimer = window.setTimeout(() => {
            this.trackReadyTimer = null;
            reject(new Error("The translated audio track did not arrive."));
          }, 12_000);
        }),
      ]);
      if (this.trackReadyTimer !== null) {
        window.clearTimeout(this.trackReadyTimer);
        this.trackReadyTimer = null;
      }
    } catch (error) {
      this.stop();
      this.options.onState?.("unavailable");
      throw error;
    }
  }

  /**
   * Only relay audio while the speaker is actually speaking.
   *
   * Left running on an open microphone, the transcriber hallucinates on room
   * noise and near-silence - the "Hallo YouTube" and "thanks for watching"
   * artefacts it learned from video captions - and those hallucinations are
   * then spoken aloud to the listener, so the call appears to talk to itself
   * once the speaker has stopped. Muting the relayed copy during silence gives
   * it nothing to invent from.
   *
   * Deliberately asymmetric: sound reopens the gate on the very next frame,
   * while it takes a continuous stretch of quiet to close it, so a pause for
   * breath mid-sentence never clips the words on either side of it. The gate
   * acts on our private clone, never on meeting playback.
   */
  private startSpeechGate(sourceStream: MediaStream, relayTrack: MediaStreamTrack) {
    // One shared AudioContext for the whole page. A context per speaker would
    // reach the browser's per-page ceiling (around six in Chrome) on a call of
    // any size, and the gates would start failing to open silently.
    const context = ensureTranslationAudioContext();
    if (!context) return;
    try {
      const source = context.createMediaStreamSource(sourceStream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);

      // Start closed. This prevents the one-to-two seconds of room noise before
      // the first analyser sample from becoming translated hallucinations.
      relayTrack.enabled = false;
      let gate: SpeechGateState = { relaying: false, quietSince: 0 };
      const timer = window.setInterval(() => {
        if (this.stopped) return;
        const contextRunning = context.state === "running";
        // Ask a suspended context to wake so the gate can start measuring.
        if (context.state === "suspended") void context.resume().catch(() => undefined);

        let level = 0;
        if (contextRunning) {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += sample * sample;
          level = Math.sqrt(sum / samples.length);
        }

        gate = nextSpeechGateState({ contextRunning, level, now: Date.now() }, gate);
        if (relayTrack.enabled !== gate.relaying) relayTrack.enabled = gate.relaying;
      }, SPEECH_GATE_INTERVAL_MS);

      this.speechGate = { source, analyser, timer };
    } catch {
      // Without a gate the sidecar still works; it is a quality guard, not a
      // requirement, so a browser that refuses an AudioContext keeps translation.
      relayTrack.enabled = true;
    }
  }

  private stopSpeechGate() {
    if (!this.speechGate) return;
    const { source, timer } = this.speechGate;
    window.clearInterval(timer);
    try { source.disconnect(); } catch { /* already disconnected */ }
    // The context is shared with every other sidecar and the playback
    // fallback, so it is never closed here.
    this.speechGate = null;
  }

  /** Silences and detaches every audio element and node this sidecar created. */
  private teardownPlayback() {
    for (const element of this.playbackElements) {
      try {
        element.pause();
        element.srcObject = null;
        element.remove();
      } catch {
        // The element may already be detached.
      }
    }
    this.playbackElements.clear();
    this.audio = null;
    try { this.audioSource?.disconnect(); } catch { /* already disconnected */ }
    try { this.audioGain?.disconnect(); } catch { /* already disconnected */ }
    this.audioSource = null;
    this.audioGain = null;
  }

  setVolume(volume: number) {
    this.options.volume = Math.min(1, Math.max(0, volume));
    if (this.audio) this.audio.volume = this.options.volume;
    if (this.audioGain) this.audioGain.gain.value = this.options.volume;
  }

  stop() {
    this.stopped = true;
    if (this.transcriptIdleTimer !== null) {
      window.clearTimeout(this.transcriptIdleTimer);
      this.transcriptIdleTimer = null;
    }
    if (this.trackReadyTimer !== null) {
      window.clearTimeout(this.trackReadyTimer);
      this.trackReadyTimer = null;
    }
    try { this.connection?.close(); } catch { /* already closed */ }
    // Everything this sidecar ever attached, not just the most recent element.
    this.stopSpeechGate();
    this.teardownPlayback();
    this.relayTrack?.stop();
    this.connection = null;
    this.relayTrack = null;
    this.readyResolver = null;
  }
}
