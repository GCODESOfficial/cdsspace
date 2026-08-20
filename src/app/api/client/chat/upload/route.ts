/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getClientChatContext, getClientProjectThread } from "@/lib/client-project-chat";
import { validateChatUpload } from "@/lib/chat-upload-limits";
import { assertCleanBuffer } from "@/lib/upload-security";

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

    const buffer = Buffer.from(await file.arrayBuffer());
    assertCleanBuffer(buffer);
    const rawExt = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const ext = String(rawExt || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
    const path = `chat-attachments/client-${context.account.user.id}/${crypto.randomUUID()}.${ext}`;

    const { error } = await context.db.storage.from("media").upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;

    const { data } = context.db.storage.from("media").getPublicUrl(path);
    return NextResponse.json({
      ok: true,
      publicUrl: data.publicUrl,
      fileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

