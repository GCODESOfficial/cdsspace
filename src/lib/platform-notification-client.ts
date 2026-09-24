"use client";

let lastPlayedAt = 0;
let pushReady = false;

/**
 * The sound, the spoken brand name and the device notification.
 *
 * Two paths deliver a notice. While a tab is open the page plays the sound and
 * speaks "CDS Space". While the browser is closed the push service wakes the
 * service worker, which shows the notice with the device's own sound, since a
 * worker cannot play audio or speak.
 */
export async function enablePlatformNotifications() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    await Notification.requestPermission().catch(() => undefined);
  }
  await registerPushDevice();
}

/** Registers the worker and subscribes this browser for closed-site delivery. */
export async function registerPushDevice() {
  if (pushReady) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  pushReady = true;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    const response = await fetch("/api/push/subscribe", { cache: "no-store" });
    if (!response.ok) return;
    const { publicKey } = await response.json();
    if (!publicKey) return;

    // An existing subscription made with a different key must be replaced, or
    // the push service rejects every message sent to it.
    const existing = await registration.pushManager.getSubscription();
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    if (existing && !sameKey(existing, applicationServerKey)) {
      await existing.unsubscribe().catch(() => undefined);
    }

    const subscription = existing && sameKey(existing, applicationServerKey)
      ? existing
      : await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type !== "cds:push") return;
      // The worker already showed the notice; the page adds sound and voice.
      announcePlatformNotification({ ...event.data.payload, silentNotice: true });
    });
  } catch {
    pushReady = false;
  }
}

function sameKey(subscription: PushSubscription, key: Uint8Array) {
  const current = subscription.options?.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((byte, index) => byte === key[index]);
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function speakBrandName() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  // Written as three separate letters on purpose. Given "CDS Space", many
  // voices read the letters as the word "CDs" and it comes out "CD Space";
  // spacing them forces "C D S Space", which is the brand name.
  const voice = new SpeechSynthesisUtterance("C D S Space");
  voice.rate = 0.92;
  voice.pitch = 1;
  voice.volume = 0.85;
  window.speechSynthesis.speak(voice);
}

export function announcePlatformNotification(input?: {
  title?: string;
  body?: string;
  volume?: number;
  /** Set when the service worker already showed the device notice. */
  silentNotice?: boolean;
}) {
  const now = Date.now();
  if (now - lastPlayedAt < 1_200) return;
  lastPlayedAt = now;

  const audio = new Audio("/special-notification.mp3");
  audio.volume = input?.volume ?? 0.75;
  let spoken = false;
  const speakOnce = () => {
    if (spoken) return;
    spoken = true;
    speakBrandName();
  };
  audio.addEventListener("ended", speakOnce, { once: true });
  audio.play().catch(speakOnce);
  window.setTimeout(speakOnce, 3_500);

  if (!input?.silentNotice && typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      const notice = new Notification(input?.title || "CDS Space", {
        body: input?.body || "You have a new update.",
        icon: "/favicon.png",
        tag: `cds-space-${now}`,
      });
      window.setTimeout(() => notice.close(), 12_000);
    } catch {
      // In-page sound remains available when system notifications are blocked.
    }
  }
}
