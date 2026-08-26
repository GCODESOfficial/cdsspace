"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";

/**
 * Draft recovery for "new document" forms.
 *
 * The rule this enforces, everywhere it is used: **a new document always opens
 * blank**. An autosaved draft is never applied on its own, because silently
 * reviving the last unfinished document meant a new invoice inherited the
 * previous client, items and - worst of all - its server draft id, so saving
 * overwrote the earlier record instead of creating a new one.
 *
 * Instead the draft is offered. `recovered` holds the snapshot if one exists;
 * render `<DraftRecoveryBanner />` and the user chooses to restore or discard.
 *
 * Usage:
 *   const draft = useDraftRecovery<FormState>("invoice", { skip: !!editId });
 *   useEffect(() => { if (!hydrating) draft.save(state); }, [state, hydrating]);
 *   // on successful submit:
 *   draft.clear();
 */

const PREFIX = "cds.draft.";
// Anything older than this is stale enough that offering it is just noise.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored<T> {
  savedAt: number;
  state: T;
}

export interface DraftRecovery<T> {
  /** Snapshot waiting to be restored, or null. Never applied automatically. */
  recovered: T | null;
  /** When that snapshot was written. */
  savedAt: number | null;
  /** Persist the current form state. Safe to call on every change. */
  save: (state: T) => void;
  /** Take the pending snapshot and stop offering it. */
  restore: () => T | null;
  /** Throw the pending snapshot away. */
  discard: () => void;
  /** Remove the stored draft entirely. Call after a successful submit. */
  clear: () => void;
}

export function useDraftRecovery<T>(
  key: string,
  options: { skip?: boolean } = {},
): DraftRecovery<T> {
  const storageKey = `${PREFIX}${key}`;
  const skip = !!options.skip;
  const [pending, setPending] = useState<Stored<T> | null>(null);
  // Reading and offering happens once per mount; later saves must not re-offer.
  const checked = useRef(false);
  // The state the form opened with, and whether it has since been typed into.
  const opening = useRef<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (skip || checked.current) return;
    checked.current = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Stored<T>;
      if (!parsed || typeof parsed !== "object" || !("state" in parsed)) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      setPending(parsed);
    } catch {
      // A corrupt draft is not worth surfacing; drop it.
      try { window.localStorage.removeItem(storageKey); } catch { /* noop */ }
    }
  }, [storageKey, skip]);

  const save = useCallback((state: T) => {
    if (skip) return;
    // The recovery offer belongs over an untouched form. Once the user has
    // typed, there is nothing to recover into and the offer would contradict
    // what is on screen, so it is withdrawn.
    const serialized = JSON.stringify(state);
    if (opening.current === null) opening.current = serialized;
    else if (serialized !== opening.current) setTouched(true);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), state }));
    } catch {
      /* quota or private mode - autosave is a convenience, never a requirement */
    }
  }, [storageKey, skip]);

  const restore = useCallback(() => {
    const state = pending?.state ?? null;
    setPending(null);
    return state;
  }, [pending]);

  const discard = useCallback(() => {
    setPending(null);
    try { window.localStorage.removeItem(storageKey); } catch { /* noop */ }
  }, [storageKey]);

  const clear = useCallback(() => {
    setPending(null);
    try { window.localStorage.removeItem(storageKey); } catch { /* noop */ }
  }, [storageKey]);

  return {
    recovered: touched ? null : pending?.state ?? null,
    savedAt: pending?.savedAt ?? null,
    save, restore, discard, clear,
  };
}

function relative(savedAt: number | null) {
  if (!savedAt) return "";
  const minutes = Math.round((Date.now() - savedAt) / 60000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The offer bar. Renders nothing when there is no draft waiting. */
export function DraftRecoveryBanner<T>({
  draft,
  label = "document",
  onRestore,
}: {
  draft: DraftRecovery<T>;
  /** Noun used in the copy, e.g. "invoice". */
  label?: string;
  onRestore: (state: T) => void;
}) {
  if (!draft.recovered) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm text-amber-900">
        You have an unfinished {label} from {relative(draft.savedAt)}. This one starts blank.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const state = draft.restore();
            if (state) onRestore(state);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restore it
        </button>
        <button
          type="button"
          onClick={draft.discard}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
        >
          <X className="h-3.5 w-3.5" /> Discard
        </button>
      </div>
    </div>
  );
}
