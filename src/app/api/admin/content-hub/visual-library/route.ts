/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";
import { requireContentHub } from "@/lib/content-hub/api-auth";
import { uploadContentHubFile } from "@/lib/content-hub/upload";
import { validateContentHubUpload } from "@/lib/content-hub/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.map((x) => str(x)).filter(Boolean)));
}

// GET /api/admin/content-hub/visual-library?kind=&status=&search=&limit=
export async function GET(req: NextRequest) {
  const { deny } = await requireContentHub();
  if (deny) return deny;

  const url = new URL(req.url);
  const kind = str(url.searchParams.get("kind"));
  const status = str(url.searchParams.get("status"));
  const search = str(url.searchParams.get("search"));
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200));

  const where: string[] = [];
  const params: any[] = [];
  let p = 0;

  if (["image", "video"].includes(kind)) {
    params.push(kind);
    where.push(`kind = $${++p}`);
  }
  if (["available", "used", "archived"].includes(status)) {
    params.push(status);
    where.push(`status = $${++p}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(
      lower(coalesce(title,'')) like $${++p}
      or lower(coalesce(file_name,'')) like $${p}
      or lower(coalesce(notes,'')) like $${p}
      or exists (select 1 from unnest(tags) t where lower(t) like $${p})
    )`);
  }
  params.push(limit);

  const [items, counts] = await Promise.all([
    glashQuery<any>(
      `select * from public.content_visual_assets
        ${where.length ? `where ${where.join(" and ")}` : ""}
        order by created_at desc
        limit $${++p}`,
      params,
    ),
    glashQuery<{ status: string; n: number }>(
      `select status, count(*)::int as n
       from public.content_visual_assets
       group by status`,
    ),
  ]);

  return NextResponse.json({
    ok: true,
    items,
    counts: Object.fromEntries(counts.map((row) => [row.status, row.n])),
  });
}

// POST multipart/form-data { files[] } -> uploads image/video assets into Visual Library.
export async function POST(req: NextRequest) {
  const { session, deny } = await requireContentHub("content_hub.visual_library");
  if (deny) return deny;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Upload could not be read. Videos can be up to 150MB each; upload large videos one at a time.",
      },
      { status: 413 },
    );
  }
  const files = [
    ...form.getAll("files"),
    ...form.getAll("file"),
  ].filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "Upload at least one image or video." }, { status: 400 });
  }

  const tags = strArr(String(form.get("tags") || "").split(","));
  const notes = str(form.get("notes")) || null;

  try {
    const items = await Promise.all(files.map(async (file) => {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        throw new Error(`${file.name} is not an image or video.`);
      }
      const validation = validateContentHubUpload(file.size, file.type, file.name);
      if (!validation.ok) throw new Error(validation.error);

      const uploaded = await uploadContentHubFile(file, "content-hub/visual-library");
      if (uploaded.kind !== "image" && uploaded.kind !== "video") {
        throw new Error(`${file.name} is not an image or video.`);
      }

      const [item] = await glashQuery<any>(
        `insert into public.content_visual_assets
           (url, kind, file_name, mime_type, size_bytes, title, notes, tags, created_by, created_by_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning *`,
        [
          uploaded.url,
          uploaded.kind,
          uploaded.file_name,
          uploaded.mime_type,
          uploaded.size_bytes,
          uploaded.file_name.replace(/\.[^.]+$/, ""),
          notes,
          tags,
          session!.name,
          session!.memberId || session!.email,
        ],
      );
      return item;
    }));

    await logActivity({
      action: "content.visual_library.upload",
      page: "content-hub",
      resource_type: "visual_asset",
      resource_label: `${items.length} visual asset${items.length === 1 ? "" : "s"} uploaded`,
      metadata: { count: items.length, kinds: Array.from(new Set(items.map((item) => item.kind))) },
    });

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes("Videos must be 150MB or smaller") ? 413 : 500 },
    );
  }
}
