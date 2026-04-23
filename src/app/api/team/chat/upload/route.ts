/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getChatViewer } from "@/lib/team-chat-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `chat-attachments/${fileName}`;

    const db = supabaseAdmin as any;
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
