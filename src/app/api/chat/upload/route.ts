/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { getClientChatAdminActor } from "@/lib/client-chat-admin";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { validateChatUpload } from "@/lib/chat-upload-limits";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = await getClientChatAdminActor("messages.send");
  const user = await verifyUser();
  if (!admin && !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const roomId = String(formData.get("roomId") || "");
    const clientActorRequested = formData.get("actor") === "client";
    if (!file || !roomId) return NextResponse.json({ ok: false, error: "File and room are required" }, { status: 400 });
    if (clientActorRequested && !user) {
      return NextResponse.json({ ok: false, error: "Client session required" }, { status: 401 });
    }
    if ((clientActorRequested || !admin) && roomId !== `client_${user!.user.id}`) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const check = validateChatUpload(file.size, file.type || "");
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 413 });

    const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "office", "zip", "design"], maxBytes: 50 * 1024 * 1024 });
    if ((check.kind === "image" && safe.kind !== "image")
      || (check.kind === "video" && !safe.contentType.startsWith("video/"))
      || (check.kind === "other" && (safe.kind === "image" || safe.contentType.startsWith("video/")))) {
      throw new UploadSecurityError("The file contents do not match the selected attachment type.");
    }
    const db = getGlashDbAdmin() as any;
    const path = `chat-attachments/admin-client/${crypto.randomUUID()}.${safe.ext}`;
    const { error } = await db.storage.from("media").upload(path, safe.buffer, {
      contentType: safe.contentType,
      upsert: false,
    });
    if (error) throw error;
    const { data } = db.storage.from("media").getPublicUrl(path);
    return NextResponse.json({
      ok: true,
      publicUrl: data.publicUrl,
      fileName: file.name,
      fileSizeBytes: safe.buffer.length,
      mimeType: safe.contentType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ ok: false, error: message }, { status: error instanceof UploadSecurityError ? error.status : 500 });
  }
}
