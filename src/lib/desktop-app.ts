/**
 * CDS Space desktop app — shared download links + platform detection used by
 * the team login screen and the in-portal WorkTracker.
 *
 * Point the NEXT_PUBLIC_* env vars at wherever the installers are hosted, or
 * drop the built files in public/downloads/ with the default names.
 */

export const MAC_DOWNLOAD_URL = process.env.NEXT_PUBLIC_DESKTOP_APP_MAC_URL || "/downloads/CDS-Space-mac.dmg";
export const WIN_DOWNLOAD_URL = process.env.NEXT_PUBLIC_DESKTOP_APP_WIN_URL || "/downloads/CDS-Space-win.exe";

export type Platform = "desktop-app" | "desktop-browser" | "mobile";

export function detectPlatform(): Platform {
  if (typeof window === "undefined") return "desktop-browser";
  if ((window as unknown as { cdsDesktop?: unknown }).cdsDesktop) return "desktop-app";
  const ua = navigator.userAgent || "";
  const isMobile = /android|iphone|ipod|windows phone|mobile/i.test(ua)
    || /ipad|tablet/i.test(ua)
    // iPadOS reports as desktop Safari but is touch-only
    || (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua));
  return isMobile ? "mobile" : "desktop-browser";
}

export function detectOs(): "mac" | "windows" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/macintosh|mac os x/i.test(ua)) return "mac";
  if (/windows/i.test(ua)) return "windows";
  return "other";
}
