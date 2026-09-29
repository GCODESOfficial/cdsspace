import { NextResponse } from "next/server";
import { isCreatePrivateAssetPath, LETTERHEAD_BUCKET } from "@/lib/create-platform/letterheads";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMN = {
  firstPage: "first_page_path",
  secondPage: "second_page_path",
  stamp: "stamp_path",
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; kind: string }> }) {
  const { token, kind } = await params;
  if (!TOKEN.test(token) || !(kind in COLUMN)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const column = COLUMN[kind as keyof typeof COLUMN];
  const row = await glashMaybeOne<{ storage_path: string | null; owner_kind: "client" | "team" | "admin"; owner_id: string }>(
    `select letterhead.${column} as storage_path, letterhead.owner_kind, letterhead.owner_id
       from public.create_letterhead_signatures signature
       join public.create_letterheads letterhead on letterhead.id = signature.letterhead_id
      where signature.access_token = $1::uuid and signature.source = 'invitation'
        and letterhead.deleted_at is null`,
    [token],
  );
  if (!row?.storage_path || !isCreatePrivateAssetPath({ kind: row.owner_kind, id: row.owner_id }, row.storage_path)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage.from(LETTERHEAD_BUCKET).download(row.storage_path);
  if (error || !data) return NextResponse.json({ error: "The letterhead preview asset could not be read." }, { status: 502 });
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": data.type || "image/png",
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
