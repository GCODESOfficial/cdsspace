/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getTeamSession } from "@/lib/team-auth";
import { assertSafeImage, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";

const AVATAR_MAX_BYTES = 4 * 1024 * 1024; // 4MB

export async function POST(req: Request) {
  const session = await getTeamSession();
  const db = getGlashDbAdmin() as any;
  if (!session || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    // Security gate: sniffs magic bytes, rejects executables/EICAR, and
    // re-encodes the image from decoded pixels so nothing but a clean raster
    // image is ever written to storage.
    const safe = await assertSafeImage(file as File, { maxBytes: AVATAR_MAX_BYTES });

    const filePath = `avatars/${session.id}-${Date.now()}.${safe.ext}`;
    const { error: uploadError } = await db.storage
      .from("media")
      .upload(filePath, safe.buffer, { contentType: safe.contentType, upsert: true });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = db.storage.from("media").getPublicUrl(filePath);

    const { error: updateError } = await db
      .from("team_members")
      .update({ avatar_url: publicUrl })
      .eq("id", session.id);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, avatar_url: publicUrl });
  } catch (err: any) {
    if (err instanceof UploadSecurityError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error("Avatar upload error:", err);
    return NextResponse.json({ ok: false, error: "Could not upload your photo." }, { status: 500 });
  }
}
