import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncomingImage {
  image_url?: string;
  position?: number;
  transformations?: Record<string, unknown>;
}

/**
 * Update a portfolio work and replace its image set with the supplied
 * desired-state list. Server-side (glashQuery) - the old edit page wrote
 * directly from the browser GlashDB client, which is what was failing.
 * New image files are uploaded via /api/admin/works/upload first; only URLs
 * arrive here.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin" && !hasPermission(session.permissions, "upload_works.edit")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();
  const category = String(body?.category ?? "").trim();
  const coverImage = body?.cover_image ? String(body.cover_image) : null;
  const images: IncomingImage[] = Array.isArray(body?.images) ? body.images : [];

  if (!title) return NextResponse.json({ ok: false, error: "A project title is required." }, { status: 400 });
  if (!category) return NextResponse.json({ ok: false, error: "Please select a category." }, { status: 400 });
  if (!coverImage) return NextResponse.json({ ok: false, error: "A cover image is required." }, { status: 400 });

  const validImages = images.filter((i) => i?.image_url);
  if (validImages.length === 0) {
    return NextResponse.json({ ok: false, error: "Add at least one project image." }, { status: 400 });
  }

  try {
    const existing = await glashMaybeOne<{ id: string }>(`select id from public.works where id = $1`, [id]);
    if (!existing) return NextResponse.json({ ok: false, error: "Work not found." }, { status: 404 });

    await glashQuery(
      `update public.works
          set title = $1, description = $2, cover_image = $3, category = $4,
              industry = $5, project_scope = $6, deliverables = $7, timeline = $8,
              updated_at = now()
        where id = $9`,
      [
        title,
        description,
        coverImage,
        category,
        body?.industry ? String(body.industry).trim() : null,
        body?.project_scope ? String(body.project_scope).trim() : null,
        body?.deliverables ? String(body.deliverables).trim() : null,
        body?.timeline ? String(body.timeline).trim() : null,
        id,
      ],
    );

    // Replace the whole image set with the desired state (handles add / remove
    // / reorder / transform in one atomic-ish pass).
    await glashQuery(`delete from public.work_images where work_id = $1`, [id]);
    for (let i = 0; i < validImages.length; i++) {
      const img = validImages[i];
      const position = Number.isFinite(Number(img.position)) ? Number(img.position) : i;
      await glashQuery(
        `insert into public.work_images (work_id, image_url, position, transformations)
         values ($1, $2, $3, $4::jsonb)`,
        [id, String(img.image_url), position, JSON.stringify(img.transformations ?? {})],
      );
    }

    await logActivity({
      action: "work.update",
      page: "upload-works",
      resource_type: "work",
      resource_id: id,
      resource_label: title,
      metadata: { images: validImages.length },
    });

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to update the work." },
      { status: 500 },
    );
  }
}
