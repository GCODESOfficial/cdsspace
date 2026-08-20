"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type BotProtectionAction = "client_login" | "client_signup" | "password_reset";

const DEVELOPMENT_SITE_KEY = "1x00000000000000000000AA";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  || (process.env.NODE_ENV !== "production" ? DEVELOPMENT_SITE_KEY : "");

const PROOF_WORKER_SOURCE = `
self.onmessage = async function (event) {
  const challenge = event.data.challenge;
  const difficulty = event.data.difficulty;
  const encoder = new TextEncoder();
  const wholeBytes = Math.floor(difficulty / 8);
  const remainingBits = difficulty % 8;
  for (let counter = 0; counter <= 4294967295; counter += 1) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(challenge + "." + counter)));
    let valid = true;
    for (let index = 0; index < wholeBytes; index += 1) {
      if (hash[index] !== 0) { valid = false; break; }
    }
    if (valid && remainingBits > 0 && (hash[wholeBytes] & (255 << (8 - remainingBits))) !== 0) valid = false;
    if (valid) { self.postMessage({ counter: counter }); return; }
  }
  self.postMessage({ error: "proof_exhausted" });
};
`;

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

function solveInternalChallenge(challenge: string, difficulty: number, signal: AbortSignal) {
  return new Promise<number>((resolve, reject) => {
    if (!window.Worker || !window.crypto?.subtle) {
      reject(new Error("Browser security checks are unavailable."));
      return;
    }
    const blobUrl = URL.createObjectURL(new Blob([PROOF_WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(blobUrl);
    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{ counter?: number; error?: string }>) => {
      cleanup();
      if (typeof event.data.counter === "number") resolve(event.data.counter);
      else reject(new Error(event.data.error || "Security proof failed."));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("Security proof failed."));
    };
    worker.postMessage({ challenge, difficulty });
  });
}

export function BotCheck({
  action,
  onTokenChange,
  resetSignal = 0,
}: {
  action: BotProtectionAction;
  onTokenChange: (token: string) => void;
  resetSignal?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const callbackRef = useRef(onTokenChange);
  const [scriptReady, setScriptReady] = useState(false);
  const [internalAttempt, setInternalAttempt] = useState(0);
  const [internalState, setInternalState] = useState<"checking" | "verified" | "error">("checking");

  useEffect(() => {
    callbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    if (!scriptReady || !SITE_KEY || !containerRef.current || !window.turnstile || widgetRef.current) return;
    widgetRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      action,
      theme: "light",
      size: "flexible",
      callback: (token: string) => callbackRef.current(token),
      "expired-callback": () => callbackRef.current(""),
      "error-callback": () => callbackRef.current(""),
      "timeout-callback": () => callbackRef.current(""),
    });
    return () => {
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [action, scriptReady]);

  useEffect(() => {
    if (!SITE_KEY || !widgetRef.current || !window.turnstile || resetSignal === 0) return;
    window.turnstile.reset(widgetRef.current);
    callbackRef.current("");
  }, [resetSignal]);

  useEffect(() => {
    if (SITE_KEY) return;
    const controller = new AbortController();
    setInternalState("checking");
    callbackRef.current("");

    (async () => {
      const response = await fetch(`/api/security/bot-challenge?action=${encodeURIComponent(action)}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as {
        ok?: boolean;
        challenge?: string;
        signature?: string;
        difficulty?: number;
      } | null;
      if (!response.ok || !result?.ok || !result.challenge || !result.signature || !result.difficulty) {
        throw new Error("Security challenge unavailable.");
      }
      const counter = await solveInternalChallenge(result.challenge, result.difficulty, controller.signal);
      if (controller.signal.aborted) return;
      callbackRef.current(`cdsb1.${result.challenge}.${result.signature}.${counter}`);
      setInternalState("verified");
    })().catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!controller.signal.aborted) setInternalState("error");
    });

    return () => controller.abort();
  }, [action, internalAttempt, resetSignal]);

  if (!SITE_KEY) {
    return (
      <div className="flex min-h-12 items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12px] text-brand-body" aria-live="polite">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#0A4FE8] shadow-sm">
          {internalState === "checking"
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1 font-medium">
          {internalState === "checking" && "Checking this browser securely…"}
          {internalState === "verified" && "Secure browser check complete"}
          {internalState === "error" && "The browser check could not finish."}
        </span>
        {internalState === "error" && (
          <button
            type="button"
            onClick={() => setInternalAttempt((value) => value + 1)}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 font-semibold text-[#0A4FE8]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-brand-body">
        <ShieldCheck className="h-4 w-4 text-[#0A4FE8]" aria-hidden="true" />
        Secure human verification
      </div>
      <div ref={containerRef} className="min-h-[65px]" />
    </div>
  );
}
