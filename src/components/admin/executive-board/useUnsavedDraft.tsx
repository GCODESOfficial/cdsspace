"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Draft recovery for "create new" forms.
 *
 * A new item always opens on a blank form. If the previous attempt was closed
 * without saving, the stash from that attempt is offered alongside it, so the
 * choice between continuing the old one and starting clean stays with the user
 * instead of one silently winning.
 *
 * Only new items are stashed. Editing an existing record already has a saved
 * source of truth to fall back on, and restoring a half-typed edit over it
 * would be the more surprising behaviour.
 */

const PREFIX = "cds.board.draft.v1:";

interface Stash<T> {
  draft: T;
  savedAt: string;
}

export interface DraftRecovery<T> {
  /** The unsaved draft found when this form opened, if there was one. */
  stashed: Stash<T> | null;
  /** Load the stashed draft into the form. */
  resume: () => void;
  /** Throw the stashed draft away and stay on the blank form. */
  discard: () => void;
  /** Drop the stash after a successful save. */
  clear: () => void;
}

function read<T>(key: string): Stash<T> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stash<T>;
    return parsed && typeof parsed === "object" && parsed.draft ? parsed : null;
  } catch {
    // Storage can be unavailable or hold something we no longer understand.
    return null;
  }
}

export function useUnsavedDraft<T extends object>({
  key,
  draft,
  isNew,
  blank,
  onResume,
}: {
  key: string;
  /** The live form state, or null while the form is closed. */
  draft: T | null;
  /** False while editing a record that already exists. */
  isNew: boolean;
  /** The empty template, used to tell an untouched form from a real draft. */
  blank: T;
  onResume: (draft: T) => void;
}): DraftRecovery<T> {
  const [stashed, setStashed] = useState<Stash<T> | null>(null);
  const wasOpen = useRef(false);
  const blankSignature = JSON.stringify(blank);

  // Capture what was stashed at the moment the form opens. Reading it later
  // would return this session's own autosave rather than the previous attempt.
  useEffect(() => {
    const open = Boolean(draft) && isNew;
    if (open && !wasOpen.current) setStashed(read<T>(key));
    if (!open) setStashed(null);
    wasOpen.current = open;
  }, [draft, isNew, key]);

  // Keep the stash current while the form is dirty. Debounced so a long field
  // is not one storage write per keystroke.
  useEffect(() => {
    if (!draft || !isNew) return;
    const serialized = JSON.stringify(draft);
    if (serialized === blankSignature) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify({ draft, savedAt: new Date().toISOString() }));
      } catch {
        // Losing the stash is acceptable; blocking the form is not.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, isNew, key, blankSignature]);

  const forget = () => {
    try { window.localStorage.removeItem(PREFIX + key); } catch { /* nothing to clean up */ }
    setStashed(null);
  };

  // The offer only makes sense over a genuinely empty form. Once anything has
  // been typed - or the stash has been resumed into the fields - there is
  // nothing to recover into, and showing it would contradict the form itself.
  const formIsBlank = !draft || JSON.stringify(draft) === blankSignature;

  return {
    stashed: formIsBlank ? stashed : null,
    resume: () => {
      if (stashed) onResume(stashed.draft);
      setStashed(null);
    },
    discard: forget,
    clear: forget,
  };
}

function ago(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "earlier";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Offers the previous unsaved attempt at the top of a blank create form. */
export function UnsavedDraftNotice<T extends object>({
  recovery,
  label,
  describe,
}: {
  recovery: DraftRecovery<T>;
  /** What is being created, lowercase, e.g. "revenue model". */
  label: string;
  /** Pulls a recognisable name out of the stashed draft. */
  describe: (draft: T) => string;
}) {
  if (!recovery.stashed) return null;
  const name = describe(recovery.stashed.draft).trim();
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        You have an unsaved {label}{name ? `: "${name}"` : ""}
      </p>
      <p className="mt-0.5 text-xs text-amber-800">
        Last edited {ago(recovery.stashed.savedAt)}. This form is blank - continue the earlier one, or start fresh.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={recovery.resume}
          className="inline-flex h-9 items-center rounded-xl bg-amber-600 px-3 text-xs font-bold text-white transition hover:bg-amber-700"
        >
          Continue that {label}
        </button>
        <button
          type="button"
          onClick={recovery.discard}
          className="inline-flex h-9 items-center rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
        >
          Start fresh
        </button>
      </div>
    </div>
  );
}
