import { NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { isDeliveryPublicToken } from "@/lib/delivery-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!isDeliveryPublicToken(token)) return new NextResponse("Cover not found", { status: 404 });

  const cover = await glashMaybeOne<{
    title: string;
    cover_storage_bucket: string;
    cover_storage_path: string;
    cover_mime_type: string;
  }>(
    `select title, cover_storage_bucket, cover_storage_path, cover_mime_type
       from public.client_deliveries
      where public_token = $1::uuid
        and status in ('awaiting_account', 'published')
        and public_access_revoked_at is null
        and cover_storage_bucket is not null
        and cover_storage_path is not null
      limit 1`,
    [token],
  );
  if (!cover) return new NextResponse("Cover not found", { status: 404 });

  const storage = (getGlashDbAdmin() as any).storage.from(cover.cover_storage_bucket);
  const { data, error } = await storage.download(cover.cover_storage_path);
  if (error || !data) {
    console.error("[delivery/cover] storage download failed", {
      tokenSuffix: token.slice(-8),
      error: error?.message,
    });
    return new NextResponse("Cover is temporarily unavailable", { status: 503 });
  }

  const blob = data as Blob;
  return new NextResponse(blob.stream(), {
    status: 200,
    headers: {
      "Content-Type": cover.cover_mime_type || blob.type || "image/jpeg",
      "Content-Length": String(blob.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(cover.title.slice(0, 120))}-cover.jpg"`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
