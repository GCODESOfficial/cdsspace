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
 * Create a portfolio work + its images.
 *
 * All writes go through glashQuery (direct Postgres / service role), so they
 * are NOT subject to the browser anon RLS that made the old client-side
 * `supabase.from("works").insert(...).select()` return an empty array and
 * crash on `workData[0].id`. Body is JSON; files are uploaded separately via
 * /api/admin/works/upload and only their URLs are sent here.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin" && !hasPermission(session.permissions, "upload_works.create")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

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
    // `description` is NOT NULL in the schema - fall back to "".
    const work = await glashMaybeOne<{ id: string }>(
      `insert into public.works
         (title, description, cover_image, category, industry, project_scope, deliverables, timeline)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        title,
        description,
        coverImage,
        category,
        body?.industry ? String(body.industry).trim() : null,
        body?.project_scope ? String(body.project_scope).trim() : null,
        body?.deliverables ? String(body.deliverables).trim() : null,
        body?.timeline ? String(body.timeline).trim() : null,
      ],
    );
    if (!work) throw new Error("The work record could not be created.");

    // Bulk-insert images with positions + transformations.
    for (let i = 0; i < validImages.length; i++) {
      const img = validImages[i];
      const position = Number.isFinite(Number(img.position)) ? Number(img.position) : i;
      await glashQuery(
        `insert into public.work_images (work_id, image_url, position, transformations)
         values ($1, $2, $3, $4::jsonb)`,
        [work.id, String(img.image_url), position, JSON.stringify(img.transformations ?? {})],
      );
    }

    await logActivity({
      action: "work.create",
      page: "upload-works",
      resource_type: "work",
      resource_id: work.id,
      resource_label: title,
      metadata: { images: validImages.length },
    });

    return NextResponse.json({ ok: true, id: work.id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to save the work." },
      { status: 500 },
    );
  }
}
