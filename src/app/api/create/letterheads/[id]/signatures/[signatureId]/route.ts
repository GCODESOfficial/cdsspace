import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { getLetterhead, isCreatePrivateAssetPath, LETTERHEAD_BUCKET } from "@/lib/create-platform/letterheads";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; signatureId: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  const { id, signatureId } = await params;
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (!UUID.test(id) || !UUID.test(signatureId)) return NextResponse.json({ error: "Invalid signature ID." }, { status: 400 });
  const row = await glashMaybeOne<{ storage_path: string | null }>(
    `delete from public.create_letterhead_signatures signature
      using public.create_letterheads letterhead
      where signature.id = $3::uuid and signature.letterhead_id = $4::uuid
        and signature.letterhead_id = letterhead.id
        and letterhead.owner_kind = $1 and letterhead.owner_id = $2 and letterhead.deleted_at is null
      returning signature.storage_path`,
    [actor.kind, actor.id, signatureId, id],
  );
  if (!row) return NextResponse.json({ error: "Signature not found." }, { status: 404 });
  if (row.storage_path && isCreatePrivateAssetPath(actor, row.storage_path)) {
    const references = await glashMaybeOne<{ total: string }>(
      `select (
         (select count(*) from public.create_letterheads
           where deleted_at is null and ($1 = first_page_path or $1 = second_page_path or $1 = signature_path or $1 = stamp_path))
         + (select count(*) from public.create_letterhead_signatures where storage_path = $1)
         + (select count(*) from public.create_saved_signatures where storage_path = $1 and deleted_at is null)
       )::text as total`,
      [row.storage_path],
    );
    if (Number(references?.total || 0) === 0) {
      const db = getGlashDbAdmin() as any;
      await db.storage.from(LETTERHEAD_BUCKET).remove([row.storage_path]).catch(() => undefined);
    }
  }
  return NextResponse.json({ ok: true, letterhead: await getLetterhead(actor, id) });
}
