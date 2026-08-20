import { NextResponse } from "next/server";
import { createClient } from "@/lib/glashdb/server";
import { getVerifiedAuthUser } from "@/lib/glashdb/auth-user";
import { supabaseAdmin } from "@/lib/supabase";
import { assertSafeImage, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const db = await createClient();
  const user = await getVerifiedAuthUser(db.auth);
  if (!user || !supabaseAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a profile picture." }, { status: 400 });
    const safe = await assertSafeImage(file, { maxBytes: MAX_BYTES });
    const path = `avatars/marketers/${user.id}/${Date.now()}.${safe.ext}`;
    // The Glash compatibility client intentionally keeps storage loosely typed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = (supabaseAdmin as any).storage.from("media");
    const { error: uploadError } = await storage.upload(path, safe.buffer, {
      contentType: safe.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = storage.getPublicUrl(path);
    const { error: updateError } = await supabaseAdmin.from("brand_marketers").update({ profile_photo_url: data.publicUrl, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true, avatarUrl: data.publicUrl });
  } catch (error) {
    if (error instanceof UploadSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not upload your profile picture." }, { status: 500 });
  }
}
