import { NextRequest, NextResponse } from "next/server";
import { financeDb, requireFinanceAdminAsync } from "@/lib/finance/api-auth";
import { BRAND_IDENTITY_BUCKET } from "@/lib/brand-identity";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const denied = await requireFinanceAdminAsync(req, "finance.manage");
  if (denied) return denied;
  const { id, fileId } = await params;
  const db = financeDb();

  const { data: file, error } = await db
    .from("brand_identity_delivery_files")
    .select("id, storage_path, delivery_id")
    .eq("id", fileId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!file) return NextResponse.json({ error: "Brand identity file not found." }, { status: 404 });

  const { data: delivery } = await db
    .from("brand_identity_deliveries")
    .select("id")
    .eq("id", file.delivery_id)
    .eq("project_id", id)
    .maybeSingle();
  if (!delivery) return NextResponse.json({ error: "Brand identity file not found." }, { status: 404 });

  await db.storage.from(BRAND_IDENTITY_BUCKET).remove([file.storage_path]);
  const { error: deleteError } = await db.from("brand_identity_delivery_files").delete().eq("id", file.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
