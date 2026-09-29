import { after, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { archiveTutorial, listAdminTutorials, saveTutorial, updateTutorialMetadata } from "@/lib/tutorials";
import { UploadSecurityError } from "@/lib/upload-security";
import { logActivity } from "@/lib/activity-log";
import { processTutorialLocalisation } from "@/lib/tutorial-processing";
import { compressStoredTutorialVideo, describeSaving } from "@/lib/tutorial-compression";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "The tutorial could not be saved." },
    { status: error instanceof UploadSecurityError ? error.status : 500 },
  );
}

export async function GET(request: NextRequest) {
  const { session, denied } = await requireAdmin(request, "content_hub");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, tutorials: await listAdminTutorials() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const { session, denied } = await requireAdmin(request, "content_hub");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const video = form.get("video");
    if (!(video instanceof File) || !video.size) return NextResponse.json({ error: "Choose a tutorial video." }, { status: 400 });
    const id = await saveTutorial({
      toolSlug: form.get("toolSlug"), tags: form.get("tags"), title: form.get("title"), description: form.get("description"),
      status: form.get("status"), sortOrder: form.get("sortOrder"),
      languageCode: form.get("languageCode"), languageName: form.get("languageName"),
      video,
      createdBy: session.email,
    });
    after(async () => {
      // Compress first: the translated tracks are then generated from the
      // same file clients will actually stream.
      const compression = await compressStoredTutorialVideo(id).catch((error) => {
        console.error("[tutorial-compression]", error);
        return null;
      });
      if (compression?.changed) console.log("[tutorial-compression]", id, describeSaving(compression));
      await processTutorialLocalisation(id).catch((error) => console.error("[tutorial-localisation]", error));
    });
    await logActivity({ action: "tutorial.save", page: "tutorials", resource_type: "tutorial", resource_id: id, resource_label: String(form.get("title") || "Tutorial") });
    return NextResponse.json({ ok: true, id, tutorials: await listAdminTutorials() }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest) {
  const { session, denied } = await requireAdmin(request, "content_hub");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id || "");
    if (body.action === "reprocess") {
      await glashQuery(`update public.dashboard_tutorials set processing_status='queued', processing_error=null where id=$1::uuid and deleted_at is null`, [id]);
      after(async () => {
        await processTutorialLocalisation(id).catch((error) => console.error("[tutorial-localisation]", error));
      });
      return NextResponse.json({ ok: true, tutorials: await listAdminTutorials() });
    }
    await updateTutorialMetadata(id, body);
    return NextResponse.json({ ok: true, tutorials: await listAdminTutorials() });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await requireAdmin(request, "content_hub");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    await archiveTutorial(id);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
