import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { logActivity } from "@/lib/activity-log";
import { getGlashDbAdmin } from "@/lib/glashdb";
import {
  completeClientDeliveryChunkUpload,
  DeliveryWorkflowError,
  getClientDelivery,
} from "@/lib/client-deliveries-server";
import {
  isIgnoredDeliveryPath,
  deliveryFileMaximumBytes,
  MAX_DELIVERY_UPLOAD_CHUNK_BYTES,
} from "@/lib/client-deliveries";
import { UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminContext = {
  role: string;
  permissions: string[];
  email: string;
  name?: string | null;
};

function can(session: AdminContext, permission: string) {
  return session.role === "super_admin" || hasPermission(session.permissions, permission);
}

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof DeliveryWorkflowError || error instanceof UploadSecurityError
    ? error.status
    : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

async function authorizedDelivery(req: NextRequest, deliveryId: string) {
  const { session, denied } = await requireAdmin(req, "deliveries");
  if (denied || !session) return { response: denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const delivery = await getClientDelivery(deliveryId);
  if (!delivery) return { response: NextResponse.json({ error: "Delivery draft was not found." }, { status: 404 }) };
  const permission = ["published", "awaiting_account"].includes(delivery.status)
    ? "deliveries.send"
    : "deliveries.create";
  if (!can(session, permission) && !(delivery.status === "draft" && can(session, "deliveries.send"))) {
    return { response: NextResponse.json({ error: "You do not have clearance to upload files to this delivery." }, { status: 403 }) };
  }
  if (!["draft", "published", "awaiting_account"].includes(delivery.status)) {
    return { response: NextResponse.json({ error: "This delivery is not open for file uploads." }, { status: 409 }) };
  }
  return { session, delivery };
}

function readUploadMetadata(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const deliveryId = clean(params.get("delivery_id"), 80);
  const uploadId = clean(params.get("upload_id"), 80);
  const chunkIndex = Number(params.get("chunk_index"));
  const chunkCount = positiveInteger(params.get("chunk_count"));
  const fileSize = positiveInteger(params.get("file_size"));
  const fileName = clean(params.get("file_name"), 180);
  const relativePath = clean(params.get("relative_path"), 1400);
  return { deliveryId, uploadId, chunkIndex, chunkCount, fileSize, fileName, relativePath };
}

function validateMetadata(input: ReturnType<typeof readUploadMetadata>) {
  if (!UUID_PATTERN.test(input.deliveryId) || !UUID_PATTERN.test(input.uploadId)) {
    throw new DeliveryWorkflowError("Invalid delivery upload reference.");
  }
  if (!input.fileName || !input.relativePath) {
    throw new DeliveryWorkflowError("The upload is missing its file name or folder path.");
  }
  // The file picker already drops macOS/Windows metadata (._Name, .DS_Store,
  // __MACOSX); this names the real cause if one arrives some other way,
  // instead of a misleading "file type not allowed".
  if (isIgnoredDeliveryPath(input.relativePath)) {
    throw new DeliveryWorkflowError(`${input.relativePath} is system metadata, not a deliverable. It is skipped automatically - refresh the page and add the folder again.`);
  }
  if (!input.fileSize || input.fileSize > deliveryFileMaximumBytes(input.fileName)) {
    throw new DeliveryWorkflowError("Videos must be 150MB or smaller; other delivery files must be 50MB or smaller.", 413);
  }
  const expectedChunks = Math.ceil(input.fileSize / MAX_DELIVERY_UPLOAD_CHUNK_BYTES);
  if (input.chunkCount !== expectedChunks || input.chunkIndex < 0 || input.chunkIndex >= input.chunkCount) {
    throw new DeliveryWorkflowError("Invalid file chunk sequence.");
  }
}

function pendingChunkPaths(deliveryId: string, uploadId: string, chunkCount: number) {
  return Array.from(
    { length: chunkCount },
    (_, index) => `pending/client-deliveries/${deliveryId}/${uploadId}/${index}`,
  );
}

/** Store one raw, retryable chunk. The request body never exceeds 48 MiB. */
export async function POST(req: NextRequest) {
  try {
    const metadata = readUploadMetadata(req);
    validateMetadata(metadata);
    const authorization = await authorizedDelivery(req, metadata.deliveryId);
    if ("response" in authorization) return authorization.response;

    const expectedBytes = Math.min(
      MAX_DELIVERY_UPLOAD_CHUNK_BYTES,
      metadata.fileSize - (metadata.chunkIndex * MAX_DELIVERY_UPLOAD_CHUNK_BYTES),
    );
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_DELIVERY_UPLOAD_CHUNK_BYTES) {
      throw new DeliveryWorkflowError("Upload chunks must be 48MB or smaller.", 413);
    }
    const chunk = Buffer.from(await req.arrayBuffer());
    if (chunk.length !== expectedBytes) {
      throw new DeliveryWorkflowError(`Upload chunk ${metadata.chunkIndex + 1} is incomplete.`, 400);
    }

    const bucket = authorization.delivery.delivery_type === "brand_identity"
      ? "brand-identity-deliveries"
      : "client-deliverables";
    const path = pendingChunkPaths(metadata.deliveryId, metadata.uploadId, metadata.chunkCount)[metadata.chunkIndex];
    const storage = getGlashDbAdmin() as any;
    const { error } = await storage.storage
      .from(bucket)
      .upload(path, chunk, { contentType: "application/octet-stream", upsert: true });
    if (error) throw new DeliveryWorkflowError(error.message, 500);

    return NextResponse.json({ ok: true, chunk: metadata.chunkIndex + 1, chunks: metadata.chunkCount });
  } catch (error) {
    console.error("[client-delivery-upload] chunk failed", error);
    return errorResponse(error, "Could not upload this file chunk.");
  }
}

/** Reassemble, validate, normalise, and attach one completed file. */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    for (const [key, value] of Object.entries({
      delivery_id: body.delivery_id,
      upload_id: body.upload_id,
      chunk_index: "0",
      chunk_count: body.chunk_count,
      file_size: body.file_size,
      file_name: body.file_name,
      relative_path: body.relative_path,
    })) {
      url.searchParams.set(key, String(value ?? ""));
    }
    const metadata = readUploadMetadata(new NextRequest(url));
    validateMetadata(metadata);
    const authorization = await authorizedDelivery(req, metadata.deliveryId);
    if ("response" in authorization) return authorization.response;

    const result = await completeClientDeliveryChunkUpload(authorization.delivery, {
      uploadId: metadata.uploadId,
      fileName: metadata.fileName,
      relativePath: metadata.relativePath,
      fileSize: metadata.fileSize,
      chunkCount: metadata.chunkCount,
      chunkBytes: MAX_DELIVERY_UPLOAD_CHUNK_BYTES,
    });
    await logActivity({
      action: "delivery.file_uploaded",
      page: "clients/deliveries",
      resource_type: "client_delivery",
      resource_id: authorization.delivery.id,
      resource_label: authorization.delivery.title,
      metadata: {
        destination: "Sales Hub / Client Deliveries",
        relative_path: result.relativePath,
        file_size: result.fileSize,
        mime_type: result.mimeType,
        replaced_existing_path: result.replaced,
        chunk_count: metadata.chunkCount,
      },
    });
    return NextResponse.json({ ok: true, file: result });
  } catch (error) {
    console.error("[client-delivery-upload] completion failed", error);
    return errorResponse(error, "Could not finish this file upload.");
  }
}

/** Best-effort cleanup when the browser abandons a file upload. */
export async function DELETE(req: NextRequest) {
  try {
    const metadata = readUploadMetadata(req);
    validateMetadata(metadata);
    const authorization = await authorizedDelivery(req, metadata.deliveryId);
    if ("response" in authorization) return authorization.response;
    const bucket = authorization.delivery.delivery_type === "brand_identity"
      ? "brand-identity-deliveries"
      : "client-deliverables";
    const storage = getGlashDbAdmin() as any;
    await storage.storage
      .from(bucket)
      .remove(pendingChunkPaths(metadata.deliveryId, metadata.uploadId, metadata.chunkCount));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not clean up the interrupted upload.");
  }
}
