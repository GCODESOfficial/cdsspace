import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { hrUuid } from "@/lib/hr-personnel";
import { HR_PERSONNEL_BUCKET } from "@/lib/hr-personnel-storage";
import { hasPermission } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeDownloadName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "HR-document";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireAdmin(req, "hr_compliance.view");
  if (denied || !session) return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: rawId } = await params;
  const id = hrUuid(rawId);
  if (!id) return NextResponse.json({ error: "Invalid HR document." }, { status: 400 });
  const record = await glashMaybeOne<{ storage_path: string | null; file_name: string | null; mime_type: string | null; record_type: string }>(
    "select storage_path, file_name, mime_type, record_type from public.hr_personnel_records where id=$1",
    [id],
  );
  if (!record?.storage_path) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (record.record_type === "bank_statement" && session.role !== "super_admin" && !hasPermission(session.permissions || [], "hr_compliance.financial")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const storage = getGlashDbAdmin() as any;
  const { data, error } = await storage.storage.from(HR_PERSONNEL_BUCKET).download(record.storage_path);
  if (error || !data) return NextResponse.json({ error: "Could not retrieve the document." }, { status: 404 });
  const bytes = Buffer.from(await data.arrayBuffer());
  const contentType = record.mime_type || "application/octet-stream";
  const inline = contentType === "application/pdf" || contentType.startsWith("image/");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeDownloadName(record.file_name || "HR-document")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
