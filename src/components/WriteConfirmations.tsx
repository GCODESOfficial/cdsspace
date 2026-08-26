"use client";

import { useEffect } from "react";
import { appToast } from "@/lib/app-notify";

/**
 * Blanket "that went through" confirmation for database writes.
 *
 * Every mutating call to our own API is confirmed to the user, so no write
 * lands silently. This is a safety net, not a replacement: a screen that
 * already reports its own result keeps doing so, and the fallback stays quiet
 * (see `alreadyAnnounced`), because two popups for one action is worse than
 * none.
 *
 * Patching fetch is deliberate. The alternative is editing every mutation call
 * site in the app and re-editing each new one, which is exactly the kind of
 * coverage gap that left writes unconfirmed in the first place.
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Endpoints that write but are not a user-initiated task. Confirming these
 * would fire popups at the user for things they never asked for.
 */
const QUIET_PATHS = [
  "/api/auth",            // sign in and out already navigate
  "/api/geo",
  "/api/currency",
  "/api/analytics",
  "/api/track",
  "/api/proposals",       // view tracking on public links
  "/api/translate",
  "/api/notifications",   // background polling
  "/api/cron",
  "/api/cmeet",           // signaling: every ICE candidate is a POST
  "/api/upload",          // uploads report their own progress
  "/api/admin/executive-board/vault", // upload and share flows report inline
];

/**
 * Header a caller can set to stay silent. For writes the user did not ask for -
 * autosave being the obvious one - where a confirmation is pure noise.
 */
const SILENT_HEADER = "x-cds-silent";

/**
 * A confirmation is only warranted when the user actually asked for something.
 * A click or a form submit is that ask; typing is not, which is what separates
 * pressing Save from an autosave timer firing a few seconds after a keystroke.
 */
const COMMIT_WINDOW_MS = 4000;

const BRIDGE_PATH = "/api/glashdb/query";
const BRIDGE_WRITES = new Set(["insert", "update", "upsert", "delete"]);

/**
 * The browser query bridge is a POST whether it reads or writes, so the action
 * has to come from the body. Only a string body is inspected: a streamed one
 * cannot be read here without consuming the request the caller is about to send.
 */
function bridgeAction(init?: RequestInit): string | null {
  if (typeof init?.body !== "string") return null;
  try {
    const parsed = JSON.parse(init.body) as { action?: unknown };
    return typeof parsed.action === "string" ? parsed.action : null;
  } catch {
    return null;
  }
}

/** Wording for the surfaces we can name from the path alone. */
function describe(path: string, method: string) {
  if (method === "DELETE") return "Deleted.";
  if (path.includes("/consultation")) return "Your request has been submitted.";
  if (path.includes("/brand-brief")) return "Brief saved.";
  if (path.includes("/booking")) return "Session request submitted.";
  return "Saved.";
}

function isOurWrite(url: string, method: string) {
  if (!WRITE_METHODS.has(method)) return false;
  let path: string;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return false;
    path = parsed.pathname;
  } catch {
    return false;
  }
  if (!path.startsWith("/api/")) return false;
  return !QUIET_PATHS.some((quiet) => path.startsWith(quiet));
}

/**
 * True when something already told the user. Covers both toast systems by
 * looking for a live toast node, which is the only signal sonner exposes.
 */
function alreadyAnnounced() {
  return Boolean(document.querySelector("[data-sonner-toast], [data-app-toast]"));
}

/** True when the caller asked not to be confirmed. */
function askedForSilence(input: RequestInfo | URL, init?: RequestInit) {
  try {
    if (init?.headers && new Headers(init.headers).has(SILENT_HEADER)) return true;
    if (input instanceof Request && input.headers.has(SILENT_HEADER)) return true;
  } catch {
    // A malformed header set is not worth failing over.
  }
  return false;
}

export function WriteConfirmations() {
  useEffect(() => {
    // Capture phase, so a handler that stops propagation cannot hide the fact
    // that the user committed to something.
    let lastCommit = 0;
    const commit = () => { lastCommit = Date.now(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Enter") commit(); };
    document.addEventListener("click", commit, true);
    document.addEventListener("submit", commit, true);
    document.addEventListener("keydown", onKey, true);

    const native = window.fetch;
    // Guard against a double mount (fast refresh, or a second provider).
    if ((native as { __cdsWrapped?: boolean }).__cdsWrapped) return;

    const wrapped: typeof window.fetch = async (input, init) => {
      const method = String(
        init?.method || (input instanceof Request ? input.method : "GET"),
      ).toUpperCase();
      const url = input instanceof Request ? input.url : String(input);

      let path = "";
      try { path = new URL(url, window.location.origin).pathname; } catch { path = ""; }

      // Decide before awaiting: a string body is safe to read, but only now.
      const bridge = path === BRIDGE_PATH ? bridgeAction(init) : null;
      const silent = askedForSilence(input, init);
      const userAsked = Date.now() - lastCommit <= COMMIT_WINDOW_MS;

      const response = await native(input, init);

      const confirmable = path === BRIDGE_PATH
        ? Boolean(bridge && BRIDGE_WRITES.has(bridge))
        : isOurWrite(url, method);

      // Quiet unless the user committed to this, is here to see it, and did
      // not opt out. Otherwise the safety net becomes the noise.
      if (response.ok && confirmable && userAsked && !silent && !document.hidden) {
        // Let the caller render its own result first; only speak up if nothing did.
        window.setTimeout(() => {
          if (alreadyAnnounced()) return;
          try {
            const wording = bridge === "delete" ? "Deleted." : describe(path, method);
            appToast({ kind: "success", title: "Done", message: wording });
          } catch {
            // A confirmation must never break the request it is confirming.
          }
        }, 350);
      }

      return response;
    };

    (wrapped as { __cdsWrapped?: boolean }).__cdsWrapped = true;
    window.fetch = wrapped;
    return () => {
      window.fetch = native;
      document.removeEventListener("click", commit, true);
      document.removeEventListener("submit", commit, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return null;
}
