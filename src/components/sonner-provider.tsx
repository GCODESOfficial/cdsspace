"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Mounts sonner so the toast.success/error calls spread across the admin and
 * team surfaces actually render. Without this mounted, every one of those calls
 * is a silent no-op.
 *
 * Styling is literal rather than themed: the previous version wrapped raw hex
 * custom properties in hsl(), which produced an invalid colour and an unstyled
 * toast. It sits below the first-party rail from AppNotifyRoot so the two can
 * never draw on top of each other.
 */
export function SonnerProvider() {
  return (
    <SonnerToaster
      position="top-right"
      offset={16}
      toastOptions={{
        style: {
          background: "#FFFFFF",
          color: "#0D1B39",
          border: "1px solid rgba(15,26,74,0.08)",
          borderRadius: "12px",
          boxShadow: "0 18px 36px rgba(4,11,55,0.18)",
          fontSize: "12px",
          marginTop: "84px",
        },
      }}
    />
  );
}
