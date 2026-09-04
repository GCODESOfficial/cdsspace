"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SavedField = { value: string; checked?: boolean };

const FIELD_SELECTOR = "input, textarea, select";
const SENSITIVE = /(password|passcode|otp|token|secret|card|cvv|cvc|pin|bank|account.?number)/i;

// Anything that opens on top of the page: a modal, drawer, sheet or popover.
// These are where "new X" forms live, and a new form always opens blank, so
// this safety net must neither read from them nor write into them.
const OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  "dialog",
  ".layer-modal",
  ".layer-overlay",
  ".layer-popover",
  "[data-overlay]",
  "[data-modal]",
].join(", ");

// A page can still be fetching when it mounts, so restoring has to survive a
// late first paint. It must not survive long enough to catch a form the user
// opens deliberately: that is a new document, and it starts empty.
const RESTORE_WINDOW_MS = 3000;

function eligible(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if (element.closest('[data-autosave="off"]')) return false;
  if (element.closest(OVERLAY_SELECTOR)) return false;
  if (element instanceof HTMLInputElement && ["password", "file", "hidden", "submit", "button", "reset"].includes(element.type)) return false;
  const identity = [element.name, element.id, element.getAttribute("autocomplete"), element.getAttribute("aria-label")].filter(Boolean).join(" ");
  return !SENSITIVE.test(identity);
}

function fields() {
  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(FIELD_SELECTOR)).filter(eligible);
}

function keyFor(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, index: number) {
  const explicit = element.dataset.autosaveKey || element.name || element.id || element.getAttribute("aria-label") || element.getAttribute("placeholder");
  return `${element.tagName.toLowerCase()}:${element instanceof HTMLInputElement ? element.type : "field"}:${explicit || "anonymous"}:${index}`;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Cross-dashboard safety net for unfinished form input. Business-critical
 * workflows should still persist a structured server draft; this component
 * protects ordinary unsent fields during refreshes and navigation.
 */
export function DashboardAutoSave({ scope }: { scope: "client" | "team" | "admin" }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.includes("/login") || pathname.endsWith("/banners")) return;
    const storageKey = `cds.dashboard.autosave.v1:${scope}:${pathname}`;
    let saveTimer = 0;

    // One restore per arrival on the page. Once the page has painted its own
    // fields the safety net is done; everything that appears afterwards is
    // something the user opened, and that starts empty.
    let restored = false;

    const restore = () => {
      if (restored) return;
      let saved: Record<string, SavedField> = {};
      try { saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}"); } catch { saved = {}; }
      const currentFields = fields();
      if (!currentFields.length) return;
      restored = true;
      currentFields.forEach((element, index) => {
        if (element.dataset.autosaveRestored === storageKey) return;
        const entry = saved[keyFor(element, index)];
        if (!entry) return;
        if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
          element.checked = Boolean(entry.checked);
          element.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (element instanceof HTMLSelectElement && entry.value && element.value !== entry.value) {
          setNativeValue(element, entry.value);
        } else if (!element.value && entry.value) {
          setNativeValue(element, entry.value);
        }
        element.dataset.autosaveRestored = storageKey;
      });
    };

    const save = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        const snapshot: Record<string, SavedField> = {};
        fields().forEach((element, index) => {
          const entry: SavedField = { value: element.value };
          if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) entry.checked = element.checked;
          snapshot[keyFor(element, index)] = entry;
        });
        try { window.localStorage.setItem(storageKey, JSON.stringify(snapshot)); } catch { /* storage can be unavailable */ }
      }, 500);
    };

    // Restoring is tied to arriving on the page, not to the DOM changing later.
    // Watching every mutation meant that opening a "New revenue model" or "New
    // invoice" form refilled it with the last thing typed on that page, which
    // is the opposite of what a new document should do.
    const openedAt = Date.now();
    const observer = new MutationObserver(() => {
      // Stop watching as soon as the page has been restored, or once the grace
      // period for a slow first paint has passed.
      if (restored || Date.now() - openedAt > RESTORE_WINDOW_MS) {
        observer.disconnect();
        return;
      }
      window.setTimeout(restore, 50);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const restoreTimer = window.setTimeout(restore, 250);
    document.addEventListener("input", save, true);
    document.addEventListener("change", save, true);
    return () => {
      observer.disconnect();
      window.clearTimeout(restoreTimer);
      window.clearTimeout(saveTimer);
      document.removeEventListener("input", save, true);
      document.removeEventListener("change", save, true);
    };
  }, [pathname, scope]);

  return null;
}
