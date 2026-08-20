import { NextResponse } from "next/server";
import { BRAND_IDENTITY_BUCKET } from "@/lib/brand-identity";
import { readClientDashboardSessionUser } from "@/lib/client-dashboard-session";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDownloadName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160) || "brand-identity-file";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  if (!UUID_PATTERN.test(fileId)) return new NextResponse("File not found", { status: 404 });

  const user = await readClientDashboardSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const file = await glashMaybeOne<{
    file_name: string;
    storage_path: string;
    mime_type: string | null;
  }>(
    `select f.file_name, f.storage_path, f.mime_type
       from public.brand_identity_delivery_files f
       join public.brand_identity_deliveries d on d.id = f.delivery_id
       join public.profiles p on p.id = d.user_id
      where f.id = $1::uuid
        and d.user_id = $2::uuid
        and d.is_public = true
        and d.published_at is not null
        and coalesce(p.account_status, 'active') = 'active'
        and exists (
          select 1 from public.user_legal_agreements a where a.user_id = d.user_id
        )
      limit 1`,
    [fileId, user.id],
  );
  if (!file) return new NextResponse("File not found", { status: 404 });

  const storage = (getGlashDbAdmin() as any).storage.from(BRAND_IDENTITY_BUCKET);
  const { data, error } = await storage.download(file.storage_path);
  if (error || !data) {
    console.error("[client/brand-identity-file] storage download failed", {
      fileId,
      path: file.storage_path,
      error: error?.message,
    });
    return new NextResponse("File is temporarily unavailable", { status: 503 });
  }

  const fileName = safeDownloadName(file.file_name);
  return new NextResponse((data as Blob).stream(), {
    status: 200,
    headers: {
      "Content-Type": file.mime_type || (data as Blob).type || "application/octet-stream",
      "Content-Length": String((data as Blob).size),
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
