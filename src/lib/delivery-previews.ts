import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { getGlashDbAdmin } from "@/lib/glashdb";

const DELIVERY_PREVIEW_WIDTH = 640;
const DELIVERY_PREVIEW_HEIGHT = 480;
const DELIVERY_PREVIEW_QUALITY = 72;
const DELIVERY_PREVIEW_MEMORY_TTL_MS = 30 * 60 * 1000;
const DELIVERY_PREVIEW_MEMORY_LIMIT_BYTES = 24 * 1024 * 1024;

type CachedPreview = { buffer: Buffer; expiresAt: number };

const memoryCache = new Map<string, CachedPreview>();
const inFlightPreviews = new Map<string, Promise<{ buffer: Buffer; version: string }>>();
let memoryCacheBytes = 0;

export function deliveryPreviewVersion(storagePath: string) {
  return createHash("md5").update(storagePath).digest("hex").slice(0, 16);
}

export function deliveryPreviewPath(fileId: string, version: string) {
  return `previews/client-deliveries/${fileId}/${version}.webp`;
}

async function blobBuffer(blob: Blob) {
  return Buffer.from(await blob.arrayBuffer());
}

function readMemoryCache(key: string) {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    memoryCacheBytes -= cached.buffer.length;
    return null;
  }

  // Refresh insertion order so the first entry remains the least recently used.
  memoryCache.delete(key);
  memoryCache.set(key, cached);
  return cached.buffer;
}

function writeMemoryCache(key: string, buffer: Buffer) {
  const previous = memoryCache.get(key);
  if (previous) memoryCacheBytes -= previous.buffer.length;
  memoryCache.delete(key);
  memoryCache.set(key, { buffer, expiresAt: Date.now() + DELIVERY_PREVIEW_MEMORY_TTL_MS });
  memoryCacheBytes += buffer.length;

  while (memoryCacheBytes > DELIVERY_PREVIEW_MEMORY_LIMIT_BYTES && memoryCache.size > 1) {
    const oldestKey = memoryCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = memoryCache.get(oldestKey);
    memoryCache.delete(oldestKey);
    if (oldest) memoryCacheBytes -= oldest.buffer.length;
  }
}

export async function getOrCreateDeliveryImagePreview(input: {
  bucket: string;
  fileId: string;
  sourcePath: string;
  sourceBuffer?: Buffer;
}) {
  const version = deliveryPreviewVersion(input.sourcePath);
  const previewPath = deliveryPreviewPath(input.fileId, version);
  const cacheKey = `${input.bucket}:${previewPath}`;

  if (!input.sourceBuffer) {
    const cached = readMemoryCache(cacheKey);
    if (cached) return { buffer: cached, version };

    const pending = inFlightPreviews.get(cacheKey);
    if (pending) return pending;
  }

  const task = prepareDeliveryImagePreview({ ...input, version, previewPath, cacheKey });
  if (!input.sourceBuffer) inFlightPreviews.set(cacheKey, task);
  try {
    return await task;
  } finally {
    if (!input.sourceBuffer) inFlightPreviews.delete(cacheKey);
  }
}

async function prepareDeliveryImagePreview(input: {
  bucket: string;
  fileId: string;
  sourcePath: string;
  sourceBuffer?: Buffer;
  version: string;
  previewPath: string;
  cacheKey: string;
}) {
  const storage = (getGlashDbAdmin() as any).storage.from(input.bucket);

  if (!input.sourceBuffer) {
    const existing = await storage.download(input.previewPath);
    if (!existing.error && existing.data) {
      const buffer = await blobBuffer(existing.data as Blob);
      writeMemoryCache(input.cacheKey, buffer);
      return { buffer, version: input.version };
    }
  }

  let sourceBuffer = input.sourceBuffer;
  if (!sourceBuffer) {
    const source = await storage.download(input.sourcePath);
    if (source.error || !source.data) {
      throw new Error(source.error?.message || "The original delivery image is unavailable.");
    }
    sourceBuffer = await blobBuffer(source.data as Blob);
  }

  const buffer = await sharp(sourceBuffer, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({
      width: DELIVERY_PREVIEW_WIDTH,
      height: DELIVERY_PREVIEW_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: DELIVERY_PREVIEW_QUALITY, effort: 4 })
    .toBuffer();

  const uploaded = await storage.upload(input.previewPath, buffer, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  if (uploaded.error) throw new Error(uploaded.error.message);

  writeMemoryCache(input.cacheKey, buffer);
  return { buffer, version: input.version };
}
