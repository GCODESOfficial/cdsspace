"use client";

import { useEffect, useRef } from "react";
import { registerPushDevice } from "@/lib/platform-notification-client";

/**
 * Keeps a dashboard current without polling.
 *
 * Every tab used to refetch its notifications every two seconds and again on a
 * five second timer, whether or not anything had happened. On a phone that was
 * constant network and parsing work for answers that said "nothing new", which
 * is what made the app feel slow. The server now watches for changes and this
 * only reacts when one arrives, so a quiet dashboard costs nothing.
 */
export function useNotificationPulse(
  actor: "admin" | "client" | "team",
  onPulse: () => void,
) {
  const callbackRef = useRef(onPulse);

  useEffect(() => {
    callbackRef.current = onPulse;
  }, [onPulse]);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: number | undefined;
    let attempts = 0;
    let stopped = false;

    const pulse = () => {
      window.dispatchEvent(new Event("cds:notification-pulse"));
      callbackRef.current();
    };

    const connect = () => {
      if (stopped || typeof EventSource === "undefined") {
        // Only browsers without EventSource fall back to a timer, and slowly.
        if (!stopped && typeof EventSource === "undefined") {
          retry = window.setTimeout(() => { pulse(); connect(); }, 20_000);
        }
        return;
      }
      source = new EventSource(`/api/notifications/stream?actor=${actor}`);
      source.addEventListener("pulse", pulse);
      source.addEventListener("ready", () => { attempts = 0; });
      source.onerror = () => {
        source?.close();
        source = null;
        if (stopped) return;
        // The stream also closes itself every few minutes by design, so the
        // first reconnect is immediate and only real failures back off.
        attempts += 1;
        // Capped well above the old value: a server that is refusing streams
        // must not be asked again every few seconds by every open tab.
        const wait = Math.min(1_000 * 2 ** (attempts - 1), 120_000);
        retry = window.setTimeout(connect, attempts === 1 ? 250 : wait);
      };
    };

    connect();
    // A slow baseline, so notifications still arrive when the server declines
    // to hold a stream open (it caps them) or the connection is lost. It skips
    // hidden tabs, where the stream and device push cover everything.
    const baseline = window.setInterval(() => {
      if (!document.hidden) callbackRef.current();
    }, 20_000);

    // Someone who already allowed notifications should keep receiving them
    // with the site closed, without having to open the bell again.
    void registerPushDevice();

    // Coming back to the tab, or back online, catches up at once.
    const catchUp = () => {
      if (document.hidden) return;
      pulse();
      if (!source) { attempts = 0; connect(); }
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("online", catchUp);

    return () => {
      stopped = true;
      source?.close();
      window.clearInterval(baseline);
      window.clearTimeout(retry);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("online", catchUp);
    };
  }, [actor]);
}
