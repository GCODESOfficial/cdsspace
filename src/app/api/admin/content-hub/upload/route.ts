import { NextRequest, NextResponse } from "next/server";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { uploadContentHubFile } from "@/lib/content-hub/upload";
import { validateContentHubUpload } from "@/lib/content-hub/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST multipart/form-data { file } → { ok, url, kind, file_name, mime_type, size_bytes }
export async function POST(req: NextRequest) {
  const { deny } = await requireContentHub("content_hub.create");
  if (deny) return deny;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Upload could not be read. Videos can be up to 150MB each; upload large videos one at a time.",
      },
      { status: 413 },
    );
  }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });

  try {
    const validation = validateContentHubUpload(file.size, file.type || "", file.name);
    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 413 });
    }
    const uploaded = await uploadContentHubFile(file);
    return NextResponse.json({ ok: true, ...uploaded });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
