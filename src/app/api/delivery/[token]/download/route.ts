import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { isDeliveryPublicToken } from "@/lib/delivery-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ZipDeliveryFile = {
  file_name: string;
  relative_path: string;
  storage_bucket: string;
  storage_path: string;
  file_kind: string;
};

function safeSegment(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f<>:"|?*]/g, "-")
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, 140) || "asset";
}

function safeZipPath(relativePath: string, fallback: string) {
  const segments = (relativePath || fallback)
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .slice(0, 24)
    .map(safeSegment);
  return segments.join("/") || safeSegment(fallback);
}

function uniquePath(path: string, used: Set<string>) {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? path.slice(0, slash + 1) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  let candidate = `${directory}${stem} (${index})${extension}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${directory}${stem} (${index})${extension}`;
  }
  used.add(candidate);
  return candidate;
}

function downloadName(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "cds-space-delivery";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!isDeliveryPublicToken(token)) return new NextResponse("Delivery not found", { status: 404 });

  const delivery = await glashMaybeOne<{ id: string; title: string }>(
    `select id, title
       from public.client_deliveries
      where public_token = $1::uuid
        and status in ('awaiting_account', 'published')
        and public_access_revoked_at is null
      limit 1`,
    [token],
  );
  if (!delivery) return new NextResponse("Delivery not found", { status: 404 });

  const files = await glashQuery<ZipDeliveryFile>(
    `select file_name, coalesce(nullif(relative_path, ''), file_name) as relative_path,
            storage_bucket, storage_path, file_kind
       from public.client_delivery_files
      where delivery_id = $1
      order by position, created_at`,
    [delivery.id],
  );
  if (!files.length) return new NextResponse("No downloadable files", { status: 404 });

  const admin = getGlashDbAdmin() as unknown as {
    storage: {
      from(bucket: string): {
        download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
      };
    };
  };
  const zip = new JSZip();
  const usedPaths = new Set<string>();

  for (const file of files) {
    const { data, error } = await admin.storage.from(file.storage_bucket).download(file.storage_path);
    if (error || !data) {
      console.error("[delivery/download] storage download failed", { deliveryId: delivery.id, storagePath: file.storage_path, error: error?.message });
      return new NextResponse("One or more delivery assets are temporarily unavailable", { status: 503 });
    }
    const path = uniquePath(safeZipPath(file.relative_path, file.file_name), usedPaths);
    const bytes = new Uint8Array(await data.arrayBuffer());
    const alreadyCompressed = ["image", "archive", "pdf"].includes(file.file_kind);
    zip.file(path, bytes, { binary: true, compression: alreadyCompressed ? "STORE" : "DEFLATE" });
  }

  const payload = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "UNIX",
  });
  const baseName = downloadName(delivery.title);
  const utf8Name = encodeURIComponent(`${delivery.title}.zip`);
  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(payload.byteLength),
      "Content-Disposition": `attachment; filename="${baseName}.zip"; filename*=UTF-8''${utf8Name}`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
