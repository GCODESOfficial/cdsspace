/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getChatViewer } from "@/lib/team-chat-auth";
import { validateChatUpload } from "@/lib/chat-upload-limits";
import { canViewTeamThread, isAttachmentRestrictedThread } from "@/lib/team-chat-server";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";

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

    // Direct member chats accept photos and voice notes, but documents and videos remain in
    // managed group spaces. Block before upload so no orphaned blob is stored.
    const threadId = String(formData.get("threadId") || "");
    if (threadId) {
      if (!(await canViewTeamThread(viewer, threadId))) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      if (await isAttachmentRestrictedThread(threadId) && !file.type.startsWith("image/") && !file.type.startsWith("audio/")) {
        return NextResponse.json(
          { ok: false, error: "Documents and videos belong in a department or project group chat. Photos and voice notes can be sent directly in this chat." },
          { status: 403 },
        );
      }
    }

    // Authoritative size/type enforcement (images 6MB, videos 150MB) - the
    // client checks too, but never trust the client. 413 = Payload Too Large.
    const check = validateChatUpload(file.size, file.type || "");
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: 413 });
    }

    const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "office", "zip", "design"], maxBytes: 50 * 1024 * 1024 });
    if ((check.kind === "image" && safe.kind !== "image")
      || (check.kind === "video" && !safe.contentType.startsWith("video/"))
      || (check.kind === "other" && (safe.kind === "image" || safe.contentType.startsWith("video/")))) {
      throw new UploadSecurityError("The file contents do not match the selected attachment type.");
    }
    const fileName = `${crypto.randomUUID()}.${safe.ext}`;
    const filePath = `chat-attachments/${fileName}`;

    const { data: upload, error: uploadError } = await db.storage
      .from("media")
      .upload(filePath, safe.buffer, {
        contentType: safe.contentType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = db.storage
      .from("media")
      .getPublicUrl(filePath);

    return NextResponse.json({ ok: true, publicUrl });
  } catch (err: any) {
    console.error("Upload handler error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: err instanceof UploadSecurityError ? err.status : 500 });
  }
}
