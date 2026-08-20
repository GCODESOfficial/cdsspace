/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { getClientChatAdminActor } from "@/lib/client-chat-admin";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { validateChatUpload } from "@/lib/chat-upload-limits";
import { assertCleanBuffer } from "@/lib/upload-security";

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

    const buffer = Buffer.from(await file.arrayBuffer());
    assertCleanBuffer(buffer);
    const rawExt = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const ext = String(rawExt || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
    const db = getGlashDbAdmin() as any;
    const path = `chat-attachments/admin-client/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from("media").upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;
    const { data } = db.storage.from("media").getPublicUrl(path);
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
