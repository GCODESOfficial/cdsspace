import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { isCreatePrivateAssetPath, LETTERHEAD_BUCKET } from "@/lib/create-platform/letterheads";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  const { id } = await params;
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid signature ID." }, { status: 400 });
  const row = await glashMaybeOne<{ storage_path: string }>(
    `update public.create_saved_signatures set deleted_at = now()
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null
      returning storage_path`,
    [actor.kind, actor.id, id],
  );
  if (!row) return NextResponse.json({ error: "Saved signature not found." }, { status: 404 });
  if (isCreatePrivateAssetPath(actor, row.storage_path)) {
    const references = await glashMaybeOne<{ total: string }>(
      `select count(*)::text as total from public.create_saved_signatures
        where storage_path = $1 and deleted_at is null`,
      [row.storage_path],
    );
    if (Number(references?.total || 0) === 0) {
      const db = getGlashDbAdmin() as any;
      await db.storage.from(LETTERHEAD_BUCKET).remove([row.storage_path]).catch(() => undefined);
    }
  }
  return NextResponse.json({ ok: true });
}
