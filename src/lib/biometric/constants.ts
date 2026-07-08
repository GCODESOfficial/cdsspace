/**
 * Shared constants for the Time Machine biometric portal.
 *
 * The ZKTeco USB reader is driven by a local bridge agent (see /zkteco-bridge).
 * The portal talks to that agent over localhost; the default address below can
 * be overridden per-station via localStorage key `cds.timemachine.bridge`.
 */

export const BIOMETRIC_BRIDGE_DEFAULT_URL = "http://127.0.0.1:8787";
export const BIOMETRIC_BRIDGE_STORAGE_KEY = "cds.timemachine.bridge";

/** ZKTeco enrollment usually averages 3 captures; the bridge handles merging. */
export const ENROLL_CAPTURE_TARGET = 3;

/** Minimum 1:N match score (0–100) the station accepts for attendance. */
export const MATCH_SCORE_THRESHOLD = 55;

export const FINGER_LABELS = [
  "right_thumb",
  "right_index",
  "right_middle",
  "right_ring",
  "right_little",
  "left_thumb",
  "left_index",
  "left_middle",
  "left_ring",
  "left_little",
] as const;

export type FingerLabel = (typeof FINGER_LABELS)[number];

export function formatFinger(label: string | null | undefined): string {
  if (!label) return "-";
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type BiometricEventType =
  | "enroll"
  | "unenroll"
  | "check_in"
  | "check_out"
  | "identify_failed"
  | "duplicate_scan"
  | "correction";
