import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { mediaKindFromMime } from "@/lib/content-hub/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST multipart/form-data { file } → { ok, url, kind, file_name, mime_type, size_bytes }
export async function POST(req: NextRequest) {
  const { deny } = await requireContentHub("content_hub.create");
  if (deny) return deny;
  // GlashDB storage admin client (untyped - the generated DB type predates these
  // buckets). Uploads land in the GlashDB "media" bucket via DATABASE storage.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage: any = getGlashDbAdmin();
  if (!storage) return NextResponse.json({ ok: false, error: "Storage not configured" }, { status: 500 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });

  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `content-hub/${uuidv4()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await storage.storage
    .from("media")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data } = storage.storage.from("media").getPublicUrl(path);
  return NextResponse.json({
    ok: true,
    url: data.publicUrl,
    kind: mediaKindFromMime(file.type || ""),
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
  });
}
