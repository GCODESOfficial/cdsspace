import { NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { isDeliveryPublicToken } from "@/lib/delivery-links";
import {
  deliveryPreviewVersion,
  getOrCreateDeliveryImagePreview,
} from "@/lib/delivery-previews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIME_BY_EXTENSION: Record<string, string> = {
  ai: "application/postscript",
  csv: "text/csv; charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  eps: "application/postscript",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json; charset=utf-8",
  mov: "video/quicktime",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  psd: "image/vnd.adobe.photoshop",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

function effectiveMimeType(storedMimeType: string | null, blobMimeType: string, fileName: string) {
  const stored = storedMimeType?.trim().toLowerCase();
  const blob = blobMimeType?.trim().toLowerCase();
  const genericTypes = new Set(["application/octet-stream", "binary/octet-stream"]);
  if (stored && !genericTypes.has(stored)) return storedMimeType!;
  if (blob && !genericTypes.has(blob)) return blobMimeType;

  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  return MIME_BY_EXTENSION[extension] || "application/octet-stream";
}

function canRenderInline(mimeType: string) {
  const baseType = mimeType.split(";", 1)[0].toLowerCase();
  return baseType === "application/pdf" || baseType === "image/svg+xml" ||
    baseType.startsWith("image/") || baseType.startsWith("text/");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; fileId: string }> },
) {
  const { token, fileId } = await params;
  if (!isDeliveryPublicToken(token) || !UUID_PATTERN.test(fileId)) {
    return new NextResponse("File not found", { status: 404 });
  }

  const file = await glashMaybeOne<{
    file_name: string;
    storage_bucket: string;
    storage_path: string;
    mime_type: string | null;
    file_kind: string;
  }>(
    `select f.file_name, f.storage_bucket, f.storage_path, f.mime_type, f.file_kind
       from public.client_delivery_files f
       join public.client_deliveries d on d.id = f.delivery_id
      where f.id = $1::uuid
        and d.public_token = $2::uuid
        and d.status in ('awaiting_account', 'published')
        and d.public_access_revoked_at is null
      limit 1`,
    [fileId, token],
  );
  if (!file) return new NextResponse("File not found", { status: 404 });

  const requestUrl = new URL(request.url);
  const wantsPreview = requestUrl.searchParams.get("preview") === "1" && file.file_kind === "image";
  if (wantsPreview) {
    const version = deliveryPreviewVersion(file.storage_path);
    const etag = `"delivery-preview-${fileId}-${version}"`;
    const cacheControl = "private, max-age=31536000, immutable";
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": cacheControl },
      });
    }

    try {
      const preview = await getOrCreateDeliveryImagePreview({
        bucket: file.storage_bucket,
        fileId,
        sourcePath: file.storage_path,
      });
      return new NextResponse(Uint8Array.from(preview.buffer), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": String(preview.buffer.length),
          "Content-Disposition": "inline",
          "Cache-Control": cacheControl,
          ETag: etag,
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error("[delivery/file] preview preparation failed", {
        fileId,
        bucket: file.storage_bucket,
        path: file.storage_path,
        error: error instanceof Error ? error.message : "Unknown preview error",
      });
      return new NextResponse("Preview is temporarily unavailable", { status: 503 });
    }
  }

  // Stream through our own token-checked endpoint. GlashDB's signed-url
  // response is not Supabase-shaped in every runtime; letting the SDK assemble
  // that response produced links ending in `/storage/v1undefined`.
  const admin = getGlashDbAdmin() as unknown as {
    storage: {
      from(bucket: string): {
        download(path: string): Promise<{
          data: Blob | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const download = requestUrl.searchParams.get("download") === "1";
  const { data, error } = await admin.storage
    .from(file.storage_bucket)
    .download(file.storage_path);
  if (error || !data) {
    console.error("[delivery/file] storage download failed", {
      fileId,
      bucket: file.storage_bucket,
      path: file.storage_path,
      error: error?.message,
    });
    return new NextResponse("File is temporarily unavailable", { status: 503 });
  }

  const safeAsciiName = file.file_name
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160) || "delivery-file";
  const mimeType = effectiveMimeType(file.mime_type, data.type, file.file_name);
  const disposition = !download && canRenderInline(mimeType) ? "inline" : "attachment";
  // Browsers refuse to run their built-in PDF viewer under a sandbox CSP, so
  // PDFs (already scanned for active content at upload) only restrict framing.
  const isPdf = mimeType.split(";", 1)[0].trim().toLowerCase() === "application/pdf";
  return new NextResponse(data.stream(), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(data.size),
      "Content-Disposition": `${disposition}; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": isPdf ? "frame-ancestors 'self'" : "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
