/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import sharp from "sharp";
import { glashMaybeOne, glashOne, glashQuery } from "@/lib/glashdb/postgres";

export const FACE_DESCRIPTOR_VERSION = "center-gray-32-v1";
export const FACE_CHALLENGE_ACTIONS = ["blink", "turn left", "turn right", "nod"] as const;
export const FACE_MATCH_THRESHOLD = 0.62;
export const FACE_LIVENESS_THRESHOLD = 0.025;

export interface FaceChallengePayload {
  token: string;
  code: string;
  purpose: "enrollment" | "verification" | "login";
  actions: string[];
  expires_at: string;
}

export function hashToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomFaceActions(count = 2) {
  const shuffled = [...FACE_CHALLENGE_ACTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomHandoffCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export async function createFaceChallenge(
  memberId: string,
  purpose: "enrollment" | "verification" | "login",
  metadata: Record<string, any> = {},
): Promise<FaceChallengePayload> {
  const token = crypto.randomBytes(32).toString("base64url");
  const code = randomHandoffCode();
  const actions = randomFaceActions(purpose === "enrollment" ? 3 : 2);
  const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();
  await glashQuery(
    `insert into public.team_face_challenges
      (team_member_id, purpose, challenge_actions, token_hash, handoff_code, expires_at, metadata)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [memberId, purpose, actions, hashToken(token), code, expiresAt, JSON.stringify(metadata)],
  );
  return { token, code, purpose, actions, expires_at: expiresAt };
}

export function parseImageDataUrl(dataUrl: string) {
  const match = String(dataUrl || "").match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([\s\S]+)$/i);
  if (!match) throw new Error("Face image must be a jpeg, png, or webp data URL.");
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.byteLength > 4 * 1024 * 1024) throw new Error("Face image is larger than 4MB.");
  return buffer;
}

export async function faceDescriptor(buffer: Buffer) {
  const raw = await sharp(buffer)
    .rotate()
    .resize(32, 32, { fit: "cover" })
    .grayscale()
    .raw()
    .toBuffer();
  const values = Array.from(raw).map((value) => value / 255);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance) || 1;
  return values.map((value) => Number(((value - mean) / std).toFixed(4)));
}

export function descriptorDistance(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (!length) return 1;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const similarity = dot / ((Math.sqrt(magA) * Math.sqrt(magB)) || 1);
  return Math.max(0, Math.min(1, 1 - similarity));
}

export function livenessScore(neutral: number[], challengeDescriptors: number[][]) {
  if (!challengeDescriptors.length) return 0;
  const scores = challengeDescriptors.map((descriptor) => descriptorDistance(neutral, descriptor));
  return Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(5));
}

export function descriptorFromJson(value: any): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (Array.isArray(value?.descriptor)) return value.descriptor.map(Number).filter(Number.isFinite);
  return [];
}

export async function getChallengeFromToken(token: string) {
  return glashMaybeOne(
    "select * from public.team_face_challenges where token_hash = $1 limit 1",
    [hashToken(token)],
  );
}

export async function getChallengeFromHandoffCode(code: string) {
  return glashMaybeOne(
    "select * from public.team_face_challenges where handoff_code = $1 limit 1",
    [String(code || "").trim().toUpperCase()],
  );
}

export async function createFaceEvent(input: {
  teamMemberId: string;
  challengeId?: string | null;
  eventType: "enrollment" | "verification" | "login";
  success: boolean;
  livenessScore?: number | null;
  matchScore?: number | null;
  failureReason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any>;
  neutralImageData?: string | null;
  challengeImages?: Array<Record<string, any>>;
  flagged?: boolean;
  reviewStatus?: "clear" | "flagged" | "reviewed" | "reset_requested";
  reviewNote?: string | null;
}) {
  return glashOne(
    `insert into public.team_face_verification_events
      (team_member_id, challenge_id, event_type, success, liveness_score, match_score,
       failure_reason, ip_address, user_agent, metadata, neutral_image_data, challenge_images,
       flagged, review_status, review_note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13,$14,$15)
     returning *`,
    [
      input.teamMemberId,
      input.challengeId || null,
      input.eventType,
      input.success,
      input.livenessScore ?? null,
      input.matchScore ?? null,
      input.failureReason || null,
      input.ipAddress || null,
      input.userAgent || null,
      JSON.stringify(input.metadata || {}),
      input.neutralImageData || null,
      JSON.stringify(input.challengeImages || []),
      !!input.flagged,
      input.reviewStatus || (input.flagged ? "flagged" : "clear"),
      input.reviewNote || null,
    ],
  );
}
