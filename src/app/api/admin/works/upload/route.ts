import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { optimize } from "svgo";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { assertCleanBuffer } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FOLDERS = new Set(["covers", "works"]);

/**
 * Single-file upload for the portfolio "Works" feature.
 *
 * Runs server-side with the GlashDB service-role client so uploads bypass
 * storage RLS (the old client-side `supabase.storage` upload from the browser
 * used the anon key and silently failed). POST multipart/form-data
 * { file, folder } → { ok, url }.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin" && !hasPermission(session.permissions, "upload_works.create")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage: any = getGlashDbAdmin();
  if (!storage?.storage) {
    return NextResponse.json({ ok: false, error: "Storage is not configured." }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid upload payload." }, { status: 400 });
  }

  const file = form.get("file");
  const folderRaw = String(form.get("folder") || "works");
  const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : "works";

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "A file is required." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${folder}/${uuidv4()}.${ext}`;

  // Optimise SVGs the same way the legacy server helper did; everything else
  // uploads as-is.
  let contentType = file.type || "application/octet-stream";
  let body: Buffer;
  if (ext === "svg") {
    try {
      const optimized = optimize(await file.text(), { multipass: true });
      body = Buffer.from("data" in optimized ? optimized.data : await file.text());
      contentType = "image/svg+xml";
    } catch {
      body = Buffer.from(await file.arrayBuffer());
    }
  } else {
    body = Buffer.from(await file.arrayBuffer());
    // Pin the PDF content-type so storage serves it inline (renders in the
    // gallery <iframe>) instead of as an octet-stream download.
    if (ext === "pdf") contentType = "application/pdf";
  }

  // Reject executables / EICAR before writing to storage.
  assertCleanBuffer(body);
  const { error } = await storage.storage.from("media").upload(path, body, { contentType, upsert: false });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "Upload failed." }, { status: 500 });
  }

  const { data } = storage.storage.from("media").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
