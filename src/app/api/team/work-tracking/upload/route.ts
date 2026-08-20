import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getTeamSession } from "@/lib/team-auth";
import { assertCleanBuffer, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_PDF_BYTES = 5 * 1024 * 1024;

function cleanFileName(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "-").replace(/-+/g, "-").slice(-120) || "weekly-report.pdf";
}

export async function POST(req: NextRequest) {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "Choose a PDF document." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ ok: false, error: "PDF attachments must be 5MB or smaller." }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    assertCleanBuffer(buffer, { activeContent: true });
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json({ ok: false, error: "Only a valid PDF document can be uploaded." }, { status: 415 });
    }

    const safeName = cleanFileName(file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`);
    const storagePath = `work-reports/${session.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
    const db = getGlashDbAdmin() as any;
    const { error } = await db.storage
      .from("team-report-attachments")
      .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      attachment: {
        source_kind: "upload",
        title: file.name.slice(0, 180),
        storage_path: storagePath,
        mime_type: "application/pdf",
        size_bytes: file.size,
      },
    });
  } catch (error) {
    const status = error instanceof UploadSecurityError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Upload failed." }, { status });
  }
}
