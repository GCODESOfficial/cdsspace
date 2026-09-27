import { NextRequest, NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Same bucket and "<userId>/<timestamp>_<name>" paths the web subscription page
// uploads to directly, so POST /api/requests (which only accepts the owner's own
// paths in asset_paths) and the admin views treat both the same way.
const BUCKET = "brand-assets";

function cleanFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9.]/g, "_").replace(/_+/g, "_").slice(-120) || "asset";
}

// POST (multipart "file") → { path, name }. Add the path to asset_paths when
// submitting the design request.
export async function POST(request: NextRequest) {
  const session = await verifyUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });

  try {
    const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "office", "zip"], maxBytes: 25 * 1024 * 1024 });
    const base = cleanFileName((file as File).name || "asset").replace(/\.[^.]+$/, "");
    const path = `${session.user.id}/${Date.now()}_${base}.${safe.ext}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (getGlashDbAdmin() as any).storage.from(BUCKET).upload(path, safe.buffer, {
      contentType: safe.contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ path, name: (file as File).name || `${base}.${safe.ext}` });
  } catch (error) {
    if (error instanceof UploadSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[requests/upload] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The file could not be uploaded. Please try again." }, { status: 500 });
  }
}
