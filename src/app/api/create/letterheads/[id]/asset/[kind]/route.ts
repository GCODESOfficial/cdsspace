import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/supabase";
import { isCreatePrivateAssetPath, LETTERHEAD_BUCKET } from "@/lib/create-platform/letterheads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMN = { firstPage: "first_page_path", secondPage: "second_page_path", signature: "signature_path" } as const;

/**
 * Streams a letterhead image to its owner.
 *
 * Letterheads were shown through storage signed URLs, but GlashDB's sign
 * endpoint answers { Key, Id } rather than the { signedURL } the storage client
 * expects, so every link came out as ".../storage/v1undefined" and the preview
 * rendered as a broken image. Reading the bytes here with download() works, and
 * keeps the file behind the owner check instead of behind a link that anyone
 * holding it could open.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  const { id, kind } = await params;
  if (!UUID.test(id) || !(kind in COLUMN)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Ownership is enforced in the query itself: another account's letterhead
  // returns nothing, exactly as a letterhead that does not exist would.
  const column = COLUMN[kind as keyof typeof COLUMN];
  const row = await glashMaybeOne<{ path: string | null }>(
    `select ${column} as path from public.create_letterheads
      where id = $3::uuid and owner_kind = $1 and owner_id = $2 and deleted_at is null`,
    [actor.kind, actor.id, id],
  );
  if (!row?.path || !isCreatePrivateAssetPath(actor, row.path)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage.from(LETTERHEAD_BUCKET).download(row.path);
  if (error || !data) return NextResponse.json({ error: "The image could not be read." }, { status: 502 });

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": data.type || "image/png",
      // Do not retain another account's private artwork in a shared browser
      // cache after an account switch or logout.
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
