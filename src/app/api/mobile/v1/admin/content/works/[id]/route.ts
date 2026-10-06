import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Files the portfolio upload route writes (/api/admin/works/upload): media/covers/* and media/works/*.
const OWN_FILE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/media\/((?:covers|works)\/[^?#]+)$/;

function storagePath(url: string | null | undefined) {
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url).pathname).match(OWN_FILE)?.[1] || null;
  } catch {
    return null;
  }
}

/**
 * DELETE: deletes a portfolio work like the web's deleteWork (src/lib/storage-service.ts):
 * its stored files, its work_images rows, then the work. Only files in the portfolio's own
 * storage folders are removed; a file that is already gone never blocks the delete.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireAdmin(req, "upload_works.delete");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const work = await glashMaybeOne<{ id: string; title: string; cover_image: string | null }>(
    `select id, title, cover_image from public.works where id = $1`,
    [id],
  );
  if (!work) return NextResponse.json({ error: "Work not found." }, { status: 404 });
  const images = await glashQuery<{ image_url: string | null }>(`select image_url from public.work_images where work_id = $1`, [id]);

  const paths = Array.from(new Set([work.cover_image, ...images.map((i) => i.image_url)].map(storagePath).filter((p): p is string => !!p)));
  let filesRemoved = 0;
  if (paths.length) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storage: any = getGlashDbAdmin();
      const { error } = await storage.storage.from("media").remove(paths);
      if (!error) filesRemoved = paths.length;
    } catch {
      // The database is the source of truth; a stale file must not block the delete.
    }
  }

  await glashQuery(`delete from public.work_images where work_id = $1`, [id]);
  await glashQuery(`delete from public.works where id = $1`, [id]);
  await logActivity({
    action: "work.delete",
    page: "upload-works",
    resource_type: "work",
    resource_id: id,
    resource_label: work.title,
    metadata: { files_removed: filesRemoved },
  });
  return NextResponse.json({ ok: true, filesRemoved });
}
