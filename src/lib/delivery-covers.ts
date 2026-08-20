import "server-only";

import sharp from "sharp";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashQuery } from "@/lib/glashdb/postgres";
import { BRAND_IDENTITY_BUCKET } from "@/lib/brand-identity";
import { CLIENT_DELIVERABLES_BUCKET, MAX_DELIVERY_COVER_BYTES } from "@/lib/client-deliveries";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const DELIVERY_COVER_WIDTH = 1200;
export const DELIVERY_COVER_HEIGHT = 630;

let blankCoverPromise: Promise<Buffer> | null = null;

function blankCover() {
  blankCoverPromise ||= sharp({
    create: {
      width: DELIVERY_COVER_WIDTH,
      height: DELIVERY_COVER_HEIGHT,
      channels: 3,
      background: "#F3F6FC",
    },
  }).jpeg({ quality: 70 }).toBuffer();
  return blankCoverPromise;
}

/** Overwrite a no-longer-referenced cover when the provider cannot hard-delete it. */
export async function scrubClientDeliveryCoverObject(bucket: string, path: string) {
  const storage = (getGlashDbAdmin() as any).storage.from(bucket);
  const scrubbed = await storage.upload(path, await blankCover(), {
    contentType: "image/jpeg",
    cacheControl: "0",
    upsert: true,
  });
  if (scrubbed.error) throw new Error(scrubbed.error.message);
}

type CoverableDelivery = {
  id: string;
  delivery_type: "brand_identity" | "design";
  cover_storage_bucket: string | null;
  cover_storage_path: string | null;
};

export async function replaceClientDeliveryCover(delivery: CoverableDelivery, file: File) {
  let safe: Awaited<ReturnType<typeof assertSafeUpload>>;
  try {
    safe = await assertSafeUpload(file, {
      allow: ["image"],
      maxBytes: MAX_DELIVERY_COVER_BYTES,
      imageMaxInputPixels: 50_000_000,
    });
    if (!["image/jpeg", "image/png", "image/webp"].includes(safe.contentType)) {
      throw new UploadSecurityError("Delivery cover: choose a JPG, PNG, or WebP image.");
    }
  } catch (error) {
    if (error instanceof UploadSecurityError) {
      const message = error.message.startsWith("Delivery cover:")
        ? error.message
        : `Delivery cover: ${error.message}`;
      throw new UploadSecurityError(message, error.status);
    }
    throw error;
  }

  const normalized = await sharp(safe.buffer, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({
      width: DELIVERY_COVER_WIDTH,
      height: DELIVERY_COVER_HEIGHT,
      fit: "cover",
      position: "centre",
    })
    .flatten({ background: "#F3F6FC" })
    .jpeg({ quality: 86, progressive: true, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const bucket = delivery.delivery_type === "brand_identity"
    ? BRAND_IDENTITY_BUCKET
    : CLIENT_DELIVERABLES_BUCKET;
  // A stable object path lets replacement use an atomic upsert. This avoids
  // accumulating superseded objects on providers whose bulk delete endpoint
  // is not fully Supabase-compatible; cover_updated_at handles cache busting.
  const path = `workflow/${delivery.id}/cover/metadata.jpg`;
  const storage = (getGlashDbAdmin() as any).storage;
  const replacesSameObject = delivery.cover_storage_bucket === bucket
    && delivery.cover_storage_path === path;
  let rollbackBuffer: Buffer | null = null;
  if (replacesSameObject) {
    const previous = await storage.from(bucket).download(path);
    if (!previous.error && previous.data) {
      rollbackBuffer = Buffer.from(await (previous.data as Blob).arrayBuffer());
    }
  }
  const uploaded = await storage.from(bucket).upload(path, normalized, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: true,
  });
  if (uploaded.error) throw new Error(uploaded.error.message);

  try {
    await glashQuery(
      `update public.client_deliveries
          set cover_storage_bucket = $2,
              cover_storage_path = $3,
              cover_mime_type = 'image/jpeg',
              cover_updated_at = now(),
              updated_at = now()
        where id = $1`,
      [delivery.id, bucket, path],
    );
  } catch (error) {
    if (rollbackBuffer) {
      await storage.from(bucket).upload(path, rollbackBuffer, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: true,
      }).catch(() => undefined);
    } else if (!replacesSameObject) {
      await scrubClientDeliveryCoverObject(bucket, path).catch(() => undefined);
    }
    throw error;
  }

  if (
    delivery.cover_storage_bucket
    && delivery.cover_storage_path
    && (delivery.cover_storage_bucket !== bucket || delivery.cover_storage_path !== path)
  ) {
    await scrubClientDeliveryCoverObject(
      delivery.cover_storage_bucket,
      delivery.cover_storage_path,
    ).catch((error) => {
      console.error("[delivery-cover] old cover cleanup failed", {
        deliveryId: delivery.id,
        error: error instanceof Error ? error.message : "Unknown cleanup error",
      });
    });
  }

  return { bucket, path, mimeType: "image/jpeg", bytes: normalized.length };
}
