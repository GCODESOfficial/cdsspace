import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { AdminSession } from "@/lib/admin-session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EQUIPMENT_RECEIPT_BUCKET = "equipment-private";
export const EQUIPMENT_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export function equipmentActorKey(
  session: Pick<AdminSession, "memberId" | "email">,
) {
  return session.memberId && UUID.test(session.memberId)
    ? `member:${session.memberId}`
    : `admin:${session.email.trim().toLowerCase()}`;
}

function encryptionKey() {
  const secret =
    process.env.EQUIPMENT_PASSWORD_ENCRYPTION_KEY ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.GLASHDB_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 24)
    throw new Error("Equipment credential encryption is not configured.");
  return createHash("sha256")
    .update("cds-equipment-password:v1:")
    .update(secret)
    .digest();
}

export function encryptEquipmentPassword(value: string) {
  const password = value;
  if (!password.trim()) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptEquipmentPassword(input: {
  ciphertext: string;
  iv: string;
  tag: string;
}) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(input.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function cleanEquipmentText(value: unknown, max: number) {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .slice(0, max)
    : "";
}

/** Preserve meaningful spaces in secrets while rejecting control characters. */
export function cleanEquipmentSecret(value: unknown) {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .slice(0, 500)
    : "";
}

export function equipmentUuid(value: unknown) {
  const candidate = cleanEquipmentText(value, 40);
  return UUID.test(candidate) ? candidate : null;
}

export function equipmentDate(value: unknown) {
  const candidate = cleanEquipmentText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

export function equipmentTimestamp(value: unknown) {
  const candidate = cleanEquipmentText(value, 40);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function safeEquipmentReceiptPath(value: unknown) {
  const path = cleanEquipmentText(value, 240);
  return /^equipment-receipts\/[a-f0-9-]{36}\.(pdf|png|jpg|webp)$/i.test(path)
    ? path
    : null;
}
