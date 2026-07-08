/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getChatViewer } from "@/lib/team-chat-auth";
import { validateChatUpload } from "@/lib/chat-upload-limits";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const viewer = await getChatViewer();
  const db = getGlashDbAdmin() as any;
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    // Authoritative size/type enforcement (images 6MB, videos 50MB) - the
    // client checks too, but never trust the client. 413 = Payload Too Large.
    const check = validateChatUpload(file.size, file.type || "");
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `chat-attachments/${fileName}`;

    const { data: upload, error: uploadError } = await db.storage
      .from("media")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = db.storage
      .from("media")
      .getPublicUrl(filePath);

    return NextResponse.json({ ok: true, publicUrl });
  } catch (err: any) {
    console.error("Upload handler error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
