import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getCreateActor } from "@/lib/create-platform/session";
import { deliverLetterheadToClient } from "@/lib/letterhead-delivery";
import { logActivity } from "@/lib/activity-log";
import { isClientStorageFullError, CLIENT_STORAGE_FULL_CODE } from "@/lib/client-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const { session, denied } = await requireAdmin(request, "executive_board.letterhead_manage");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = await getCreateActor("admin");
  if (!actor) return NextResponse.json({ error: "Your admin session could not be verified." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const delivered = await deliverLetterheadToClient({ sourceId: String(body.letterheadId || ""), clientId: String(body.clientId || ""), adminOwnerId: actor.id, adminEmail: session.email });
    await logActivity({ action: "letterhead.deliver", page: "executive-board/letterhead", resource_type: "letterhead", resource_id: delivered.id, resource_label: delivered.clientName });
    return NextResponse.json({ ok: true, delivery: delivered }, { status: 201 });
  } catch (error) {
    const storageFull = isClientStorageFullError(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The letterhead could not be delivered.", ...(storageFull ? { code: CLIENT_STORAGE_FULL_CODE } : {}) }, { status: storageFull ? 409 : 400 });
  }
}
