/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getChatViewer } from "@/lib/team-chat-auth";
import { validateChatUpload } from "@/lib/chat-upload-limits";
import { canViewTeamThread, isAttachmentRestrictedThread } from "@/lib/team-chat-server";
import { assertCleanBuffer } from "@/lib/upload-security";

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

    // Files/media may only be uploaded for group spaces (department & project
    // group chats) and admin DMs - never for 1-on-1 member chats. When the
    // client sends the target thread, block early so no orphaned blob is
    // written to storage. (The message-send route enforces this again.)
    const threadId = String(formData.get("threadId") || "");
    if (threadId) {
      if (!(await canViewTeamThread(viewer, threadId))) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      if (await isAttachmentRestrictedThread(threadId)) {
        return NextResponse.json(
          { ok: false, error: "Sharing files isn't allowed in direct chats - use your department or project group chat." },
          { status: 403 },
        );
      }
    }

    // Authoritative size/type enforcement (images 6MB, videos 50MB) - the
    // client checks too, but never trust the client. 413 = Payload Too Large.
    const check = validateChatUpload(file.size, file.type || "");
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    assertCleanBuffer(buffer);
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
