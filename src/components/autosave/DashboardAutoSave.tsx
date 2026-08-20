"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SavedField = { value: string; checked?: boolean };

const FIELD_SELECTOR = "input, textarea, select";
const SENSITIVE = /(password|passcode|otp|token|secret|card|cvv|cvc|pin|bank|account.?number)/i;

function eligible(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if (element.closest('[data-autosave="off"]')) return false;
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

    const restore = () => {
      let saved: Record<string, SavedField> = {};
      try { saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}"); } catch { saved = {}; }
      const currentFields = fields();
      if (!currentFields.length) return;
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

    const observer = new MutationObserver(() => window.setTimeout(restore, 50));
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
