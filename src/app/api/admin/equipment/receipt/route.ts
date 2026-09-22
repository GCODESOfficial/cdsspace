import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import {
  EQUIPMENT_RECEIPT_BUCKET,
  EQUIPMENT_RECEIPT_MAX_BYTES,
} from "@/lib/equipment-inventory";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { denied } = await requireAdmin(req, "equipment_inventory.manage");
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json(
      { error: "Choose a receipt image or PDF." },
      { status: 400 },
    );
  try {
    const safe = await assertSafeUpload(file, {
      allow: ["image", "pdf"],
      maxBytes: EQUIPMENT_RECEIPT_MAX_BYTES,
      imageMaxDimension: 8000,
    });
    const path = `equipment-receipts/${randomUUID()}.${safe.ext}`;
    const storage = (getGlashDbAdmin() as any).storage.from(
      EQUIPMENT_RECEIPT_BUCKET,
    );
    const { error } = await storage.upload(path, safe.buffer, {
      contentType: safe.contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({
      ok: true,
      receipt: {
        storagePath: path,
        fileName: file.name.slice(0, 180),
        contentType: safe.contentType,
        sizeBytes: safe.buffer.byteLength,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Receipt upload failed.",
      },
      { status: error instanceof UploadSecurityError ? error.status : 500 },
    );
  }
}
