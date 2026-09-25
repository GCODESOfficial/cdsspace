import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { isCreatePrivateAssetPath, LETTERHEAD_BUCKET } from "@/lib/create-platform/letterheads";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  const { id } = await params;
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid signature ID." }, { status: 400 });
  const row = await glashMaybeOne<{ storage_path: string }>(
    `select storage_path from public.create_saved_signatures
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null`,
    [actor.kind, actor.id, id],
  );
  if (!row || !isCreatePrivateAssetPath(actor, row.storage_path)) return NextResponse.json({ error: "Signature not found." }, { status: 404 });
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage.from(LETTERHEAD_BUCKET).download(row.storage_path);
  if (error || !data) return NextResponse.json({ error: "Signature file not found." }, { status: 404 });
  return new NextResponse(await data.arrayBuffer(), {
    headers: { "Content-Type": data.type || "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
