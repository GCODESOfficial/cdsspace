import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { isCreatePrivateAssetPath, LETTERHEAD_BUCKET } from "@/lib/create-platform/letterheads";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; signatureId: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  const { id, signatureId } = await params;
  if (!UUID.test(id) || !UUID.test(signatureId)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = await glashMaybeOne<{ storage_path: string | null }>(
    `select signature.storage_path
       from public.create_letterhead_signatures signature
       join public.create_letterheads letterhead on letterhead.id = signature.letterhead_id
      where signature.id = $4::uuid and signature.letterhead_id = $3::uuid
        and letterhead.owner_kind = $1 and letterhead.owner_id = $2 and letterhead.deleted_at is null`,
    [actor.kind, actor.id, id, signatureId],
  );
  if (!row?.storage_path || !isCreatePrivateAssetPath(actor, row.storage_path)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage.from(LETTERHEAD_BUCKET).download(row.storage_path);
  if (error || !data) return NextResponse.json({ error: "The signature could not be read." }, { status: 502 });
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": data.type || "image/png",
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
