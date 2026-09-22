import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import {
  EQUIPMENT_RECEIPT_BUCKET,
  equipmentUuid,
} from "@/lib/equipment-inventory";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { denied } = await requireAdmin(req, "equipment_inventory.view");
  if (denied) return denied;
  const id = equipmentUuid((await params).id);
  if (!id)
    return NextResponse.json(
      { error: "Invalid equipment ID." },
      { status: 400 },
    );
  const row = await glashMaybeOne<{
    receipt_storage_path: string | null;
    receipt_file_name: string | null;
    receipt_content_type: string | null;
  }>(
    `select receipt_storage_path,receipt_file_name,receipt_content_type from public.admin_equipment where id=$1 and deleted_at is null`,
    [id],
  );
  if (!row?.receipt_storage_path)
    return NextResponse.json(
      { error: "Receipt was not found." },
      { status: 404 },
    );
  const { data, error } = await (getGlashDbAdmin() as any).storage
    .from(EQUIPMENT_RECEIPT_BUCKET)
    .download(row.receipt_storage_path);
  if (error || !data)
    return NextResponse.json(
      { error: "Receipt could not be opened." },
      { status: 500 },
    );
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": row.receipt_content_type || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.receipt_file_name || "receipt")}`,
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}
