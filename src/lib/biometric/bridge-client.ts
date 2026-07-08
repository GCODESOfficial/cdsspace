/**
 * Browser-side client for the local ZKTeco bridge agent (see /zkteco-bridge).
 *
 * A browser cannot read a USB ZKTeco reader directly, so a small local agent
 * exposes the ZKFinger SDK over localhost HTTP. This module wraps that contract
 * and provides a built-in *simulator* fallback so the Time Machine portal is
 * fully operable for setup, demos, and testing when no scanner is attached.
 *
 * Bridge contract (all JSON, `{ ok: boolean, ... }`):
 *   GET  /health   → { ok, device:{connected,model,serial}, enrolledCount, mode, version }
 *   POST /sync     ← { templates:[{id,memberId,finger,template,format}] } → { ok, loaded }
 *   POST /capture  → { ok, template, format, quality }                 (enrollment)
 *   POST /identify → { ok, matched, memberId?, finger?, score?, quality? } (1:N)
 */
import {
  BIOMETRIC_BRIDGE_DEFAULT_URL,
  BIOMETRIC_BRIDGE_STORAGE_KEY,
} from "./constants";

export type BridgeMode = "hardware" | "simulator" | "offline";

export interface BridgeHealth {
  ok: boolean;
  device: { connected: boolean; model?: string; serial?: string };
  enrolledCount?: number;
  mode?: string;
  version?: string;
}

export interface CaptureResult {
  template: string;
  format: string;
  quality: number;
}

export interface IdentifyResult {
  matched: boolean;
  memberId?: string;
  finger?: string;
  score?: number;
  quality?: number;
}

export interface SyncTemplate {
  id: string;
  memberId: string;
  finger: string;
  template: string;
  format: string;
}

export function getBridgeUrl(): string {
  if (typeof window === "undefined") return BIOMETRIC_BRIDGE_DEFAULT_URL;
  return (
    window.localStorage.getItem(BIOMETRIC_BRIDGE_STORAGE_KEY) ||
    BIOMETRIC_BRIDGE_DEFAULT_URL
  );
}

export function setBridgeUrl(url: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BIOMETRIC_BRIDGE_STORAGE_KEY, url.trim());
}

async function bridgeFetch<T>(path: string, body?: unknown, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBridgeUrl()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const json = (await res.json()) as T & { ok?: boolean; error?: string };
    if (!res.ok || json.ok === false) {
      throw new Error(json.error || `Bridge error (${res.status})`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Quick reachability probe - short timeout so the UI doesn't hang. */
export async function probeBridge(): Promise<BridgeHealth | null> {
  try {
    return await bridgeFetch<BridgeHealth>("/health", undefined, 2500);
  } catch {
    return null;
  }
}

export async function bridgeSync(templates: SyncTemplate[]): Promise<{ loaded: number }> {
  return bridgeFetch<{ loaded: number }>("/sync", { templates });
}

export async function bridgeCapture(): Promise<CaptureResult> {
  return bridgeFetch<CaptureResult>("/capture", {});
}

export async function bridgeIdentify(): Promise<IdentifyResult> {
  return bridgeFetch<IdentifyResult>("/identify", {});
}

/* ─────────────── Simulator ─────────────── */
// Used when no bridge/scanner is reachable so the portal stays fully usable.
// Templates are opaque "SIM:" blobs; identification is operator-driven (the UI
// asks which member is "scanning"), keeping the same call shape as hardware.

function randomToken(len = 24): string {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor((i * 1103515245 + 12345) % 256);
  }
  return btoa(String.fromCharCode(...bytes));
}

export function simulateCapture(): CaptureResult {
  return {
    template: `SIM:${randomToken()}`,
    format: "sim",
    quality: 70 + Math.floor((Date.now() % 30)),
  };
}

export function simulateIdentify(memberId: string, finger: string): IdentifyResult {
  return {
    matched: true,
    memberId,
    finger,
    score: 90 + (Date.now() % 9),
    quality: 75 + (Date.now() % 20),
  };
}
