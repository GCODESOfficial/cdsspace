import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, denied } = await requireAdmin(req, "deliveries");
  if (denied || !session) return denied || new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return new NextResponse("Cover not found", { status: 404 });
  const cover = await glashMaybeOne<{
    cover_storage_bucket: string;
    cover_storage_path: string;
    cover_mime_type: string;
  }>(
    `select cover_storage_bucket, cover_storage_path, cover_mime_type
       from public.client_deliveries
      where id = $1::uuid
        and cover_storage_bucket is not null
        and cover_storage_path is not null
      limit 1`,
    [id],
  );
  if (!cover) return new NextResponse("Cover not found", { status: 404 });

  const storage = (getGlashDbAdmin() as any).storage.from(cover.cover_storage_bucket);
  const { data, error } = await storage.download(cover.cover_storage_path);
  if (error || !data) {
    console.error("[admin/delivery-cover] storage download failed", { deliveryId: id, error: error?.message });
    return new NextResponse("Cover is temporarily unavailable", { status: 503 });
  }

  const blob = data as Blob;
  return new NextResponse(blob.stream(), {
    status: 200,
    headers: {
      "Content-Type": cover.cover_mime_type || blob.type || "image/jpeg",
      "Content-Length": String(blob.size),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
