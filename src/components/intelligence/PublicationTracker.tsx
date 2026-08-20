"use client";

import { useEffect, useRef } from "react";

function sessionKey() {
  try {
    const existing = sessionStorage.getItem("cds-intelligence-session");
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem("cds-intelligence-session", created);
    return created;
  } catch {
    return "anonymous";
  }
}

export function trackPublicationEvent(slug: string, event: string, value?: number, metadata?: Record<string, unknown>) {
  return fetch(`/api/intelligence/${encodeURIComponent(slug)}/track`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, value, metadata, sessionKey: sessionKey(), source: document.referrer || "direct" }),
  }).catch(() => null);
}

export default function PublicationTracker({ slug }: { slug: string }) {
  const maxDepth = useRef(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    trackPublicationEvent(slug, "view");
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (total <= 0) return;
      const depth = Math.min(100, Math.round((window.scrollY / total) * 100));
      if (depth >= maxDepth.current + 25) {
        maxDepth.current = Math.floor(depth / 25) * 25;
        trackPublicationEvent(slug, "scroll_depth", maxDepth.current);
      }
    };
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      const seconds = Math.min(7200, Math.round((Date.now() - startedAt.current) / 1000));
      if (seconds >= 5) trackPublicationEvent(slug, "time_on_page", seconds);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      onHide();
    };
  }, [slug]);
  return null;
}
