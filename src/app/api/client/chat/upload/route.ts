/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getClientChatContext, getClientProjectThread } from "@/lib/client-project-chat";
import { validateChatUpload } from "@/lib/chat-upload-limits";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const context = await getClientChatContext();
  if (!context) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const threadId = String(formData.get("threadId") || "");
    if (!file) return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });

    if (threadId) {
      const access = await getClientProjectThread(context.db, context.account.user.id, threadId);
      if (!access) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      if (access.thread.is_announcement_only) {
        return NextResponse.json({ ok: false, error: "This project channel is read-only." }, { status: 403 });
      }
    }

    const check = validateChatUpload(file.size, file.type || "");
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 413 });

    const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "office", "zip", "design"], maxBytes: 50 * 1024 * 1024 });
    if ((check.kind === "image" && safe.kind !== "image")
      || (check.kind === "video" && !safe.contentType.startsWith("video/"))
      || (check.kind === "other" && (safe.kind === "image" || safe.contentType.startsWith("video/")))) {
      throw new UploadSecurityError("The file contents do not match the selected attachment type.");
    }
    const path = `chat-attachments/client-${context.account.user.id}/${crypto.randomUUID()}.${safe.ext}`;

    const { error } = await context.db.storage.from("media").upload(path, safe.buffer, {
      contentType: safe.contentType,
      upsert: false,
    });
    if (error) throw error;

    const { data } = context.db.storage.from("media").getPublicUrl(path);
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
