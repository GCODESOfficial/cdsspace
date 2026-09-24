import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  readSecureFormUploadToken,
  SECURE_FORM_UPLOAD_BUCKET,
} from "@/lib/secure-form-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const upload = readSecureFormUploadToken((await params).token);
  if (!upload) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const permission = upload.scope === "consultations" ? "consultations" : "applicants.view";
  if (session.role !== "super_admin" && !hasPermission(session.permissions, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storage = (getSupabaseAdmin() as any)?.storage;
  const { data, error } = storage
    ? await storage.from(SECURE_FORM_UPLOAD_BUCKET).download(upload.storagePath)
    : { data: null, error: new Error("Storage unavailable") };
  if (error || !data) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const fileName = upload.storagePath.split("/").pop() || "attachment";
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Security-Policy": "sandbox",
      "Content-Type": data.type || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    },
  });
}
