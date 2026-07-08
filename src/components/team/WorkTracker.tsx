"use client";

/**
 * WorkTracker — runs in the team portal layout for every logged-in member and
 * keeps their work-tracking session alive.
 *
 * Two capture modes, chosen automatically — no post-login prompts:
 *  1. CDS Space Desktop app (window.cdsDesktop): silent capture of ALL
 *     monitors at the configured interval. Full work session.
 *  2. Any browser (desktop or mobile): activity-only. The session row stays
 *     alive so attendance/idle context flows, but no screenshots are taken —
 *     browsers can't capture the screen without a per-visit share prompt, so
 *     screenshot tracking is reserved for the desktop app. The team login
 *     screen points desktop-browser users at the app download.
 *
 * Escape hatch: `enabled = false` on team_work_tracking_settings
 * (Admin → Work Tracking) stops tracking portal-wide.
 *
 * Multiple tabs elect a single "leader" via localStorage so a member with
 * several portal tabs doesn't upload duplicate snapshots.
 *
 * This component renders nothing — it has no UI.
 */

import { useCallback, useEffect, useRef } from "react";

const LEADER_KEY = "cds_wt_leader";
const LEADER_TTL_MS = 30_000;
const HEARTBEAT_MS = 10_000;

type TrackerSettings = {
  enabled: boolean;
  capture_interval_seconds?: number;
  idle_threshold_seconds?: number;
};

type DesktopBridge = {
  captureScreens: () => Promise<{ ok: boolean; error?: string; screens: { label: string; dataUrl: string }[] }>;
};

function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { cdsDesktop?: DesktopBridge }).cdsDesktop;
  return bridge?.captureScreens ? bridge : null;
}

function tabId() {
  const w = window as unknown as { __cdsWtTabId?: string };
  if (!w.__cdsWtTabId) w.__cdsWtTabId = Math.random().toString(36).slice(2);
  return w.__cdsWtTabId;
}

function isLeader() {
  try {
    const raw = localStorage.getItem(LEADER_KEY);
    if (!raw) return false;
    const { id, at } = JSON.parse(raw);
    if (Date.now() - at > LEADER_TTL_MS) return false;
    return id === tabId();
  } catch {
    return false;
  }
}

function claimLeadership() {
  try {
    const raw = localStorage.getItem(LEADER_KEY);
    if (raw) {
      const { at } = JSON.parse(raw);
      if (Date.now() - at <= LEADER_TTL_MS && !isLeader()) return false;
    }
    localStorage.setItem(LEADER_KEY, JSON.stringify({ id: tabId(), at: Date.now() }));
    return true;
  } catch {
    return true;
  }
}

export function WorkTracker() {
  const sessionIdRef = useRef<string | null>(null);
  const settingsRef = useRef<TrackerSettings | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- activity / idle tracking ----------
  useEffect(() => {
    const bump = () => { lastActivityRef.current = Date.now(); };
    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  // ---------- leader election ----------
  useEffect(() => {
    claimLeadership();
    const hb = setInterval(() => {
      if (isLeader()) {
        try { localStorage.setItem(LEADER_KEY, JSON.stringify({ id: tabId(), at: Date.now() })); } catch { /* ignore */ }
      } else {
        claimLeadership();
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(hb);
  }, []);

  // ---------- session bootstrap ----------
  const ensureSession = useCallback(async (): Promise<boolean> => {
    if (sessionIdRef.current) return true;
    try {
      const res = await fetch("/api/team/work-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_session" }),
      });
      const json = await res.json();
      if (!json.ok) return false;
      sessionIdRef.current = json.session?.id ?? null;
      settingsRef.current = json.settings ?? { enabled: true };
      return !!sessionIdRef.current;
    } catch {
      return false;
    }
  }, []);

  // ---------- silent multi-screen capture (desktop app only) ----------
  const uploadSnapshot = useCallback(async () => {
    const bridge = desktopBridge();
    if (!bridge || !isLeader()) return;
    if (!(await ensureSession())) return;
    let frames: { dataUrl: string; label: string }[] = [];
    try {
      const res = await bridge.captureScreens();
      if (res.ok && res.screens.length) frames = res.screens;
    } catch { /* desktop capture unavailable this tick */ }
    if (!frames.length) return;
    const idleSeconds = Math.round((Date.now() - lastActivityRef.current) / 1000);
    const idleThreshold = settingsRef.current?.idle_threshold_seconds ?? 180;
    for (const frame of frames) {
      try {
        const res = await fetch("/api/team/work-tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "capture_snapshot",
            session_id: sessionIdRef.current,
            screenshot_data_url: frame.dataUrl,
            active_app: "Desktop",
            page_title: frame.label,
            page_url: null,
            activity_state: idleSeconds >= idleThreshold ? "idle" : "active",
            idle_seconds: idleSeconds,
            local_captured_at: new Date().toISOString(),
            viewport: { width: window.innerWidth, height: window.innerHeight },
            device_pixel_ratio: window.devicePixelRatio,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!json.ok && res.status === 409) {
          sessionIdRef.current = null;
          break;
        }
      } catch {
        /* network hiccup — next interval retries */
      }
    }
  }, [ensureSession]);

  const startCaptureLoop = useCallback(() => {
    if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    const intervalSec = settingsRef.current?.capture_interval_seconds ?? 300;
    setTimeout(() => { void uploadSnapshot(); }, 4000);
    captureTimerRef.current = setInterval(() => { void uploadSnapshot(); }, Math.max(60, intervalSec) * 1000);
  }, [uploadSnapshot]);

  // ---------- bootstrap ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await ensureSession();
      if (cancelled) return;
      const enabled = settingsRef.current?.enabled !== false;
      if (!ok || !enabled) return;
      // Only the desktop app can capture screens silently. In any browser the
      // session stays alive (activity-only) with no screenshots and no prompt.
      if (desktopBridge()) startCaptureLoop();
    })();
    return () => {
      cancelled = true;
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
