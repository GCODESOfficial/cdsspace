/* CDS Space service worker: notifications that arrive while the site is closed.
 *
 * The push service wakes this worker on the device, so the notice appears even
 * with every CDS Space tab closed. When a tab IS open, the worker also tells
 * the page, which plays the notification sound and speaks the brand name. A
 * service worker cannot play audio itself, so the closed-browser case uses the
 * device's own notification sound.
 */
const FALLBACK = { title: "CDS Space", body: "You have a new update.", url: "/" };

self.addEventListener("install", (event) => {
  // A new worker should take over at once rather than waiting for every tab to close.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = FALLBACK;
  try {
    payload = Object.assign({}, FALLBACK, event.data ? event.data.json() : {});
  } catch (error) {
    // A push with no readable body still deserves a notice.
  }

  event.waitUntil((async () => {
    await self.registration.showNotification(payload.title || FALLBACK.title, {
      body: payload.body || "",
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: payload.tag || "cds-space",
      // Replace the previous notice of the same kind, but still alert again.
      renotify: Boolean(payload.tag),
      requireInteraction: true,
      data: { url: payload.url || "/" },
    });

    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const tab of tabs) {
      tab.postMessage({ type: "cds:push", payload });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const tab of tabs) {
      // Reuse a tab that is already on the site rather than opening another.
      if (tab.url && new URL(tab.url).origin === self.location.origin && "focus" in tab) {
        await tab.focus();
        if ("navigate" in tab && target) await tab.navigate(target).catch(() => undefined);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
