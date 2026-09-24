import { NextResponse } from "next/server";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDownloadName(value: string) {
  return value.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "download";
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; fileToken: string }> }) {
  const { token, fileToken } = await params;
  if (!UUID.test(token) || !UUID.test(fileToken)) return new NextResponse("Not found", { status: 404 });
  const file = await glashMaybeOne<{ file_name: string; storage_bucket: string; storage_path: string; mime_type: string | null }>(
    `select file.file_name, file.storage_bucket, file.storage_path, file.mime_type
       from public.client_drive_files file
       join public.client_drives drive on drive.id = file.drive_id
      where drive.public_token = $1::uuid and drive.status = 'active' and file.public_token = $2::uuid
      limit 1`,
    [token, fileToken],
  );
  if (!file) return new NextResponse("Not found", { status: 404 });

  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage.from(file.storage_bucket).download(file.storage_path);
  if (error || !data) return new NextResponse("File is temporarily unavailable", { status: 503 });
  const name = safeDownloadName(file.file_name);
  return new NextResponse(new Uint8Array(await (data as Blob).arrayBuffer()), {
    headers: {
      "Content-Type": file.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
