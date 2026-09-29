import { after, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { listAdminTutorials, saveTutorial, scanTutorialVideo, TUTORIAL_VIDEO_MAX_BYTES } from "@/lib/tutorials";
import { UploadSecurityError } from "@/lib/upload-security";
import { logActivity } from "@/lib/activity-log";
import { processTutorialLocalisation } from "@/lib/tutorial-processing";
import { compressStoredTutorialVideo, describeSaving } from "@/lib/tutorial-compression";
import {
  beginUploadSession,
  discardUploadSession,
  getUploadSession,
  readCompletedUpload,
  storeUploadPart,
  UPLOAD_CHUNK_BYTES,
  UPLOAD_PARALLEL_PARTS,
} from "@/lib/tutorial-upload-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Tutorial uploads, one part at a time.
 *
 * Sending a whole video in a single request failed silently: the proxy refuses
 * bodies above roughly 48MB, so a 100MB recording never started. Parts of a
 * few megabytes pass, progress is real, and an interrupted upload can be
 * resumed instead of started again.
 */
function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "The upload could not be handled." },
    { status: error instanceof UploadSecurityError ? error.status : 400 },
  );
}

export async function POST(request: NextRequest) {
  const { session, denied } = await requireAdmin(request, "content_hub");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const owner = String(session.email || session.name || "admin");
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  try {
    if (action === "begin") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const fileSize = Number(body.fileSize || 0);
      const fileName = String(body.fileName || "tutorial.mp4");
      if (!Number.isFinite(fileSize) || fileSize <= 0) return failure(new Error("Choose a video to upload."));
      if (fileSize > TUTORIAL_VIDEO_MAX_BYTES) {
        return failure(new Error(`That video is larger than the ${Math.round(TUTORIAL_VIDEO_MAX_BYTES / (1024 * 1024))}MB limit.`));
      }
      const created = await beginUploadSession({ fileName, fileSize, contentType: String(body.contentType || "video/mp4"), owner });
      return NextResponse.json({
        ok: true,
        uploadId: created.id,
        chunkSize: UPLOAD_CHUNK_BYTES,
        totalParts: created.totalParts,
        parallel: UPLOAD_PARALLEL_PARTS,
        receivedIndexes: [],
        receivedBytes: 0,
      });
    }

    if (action === "chunk") {
      const form = await request.formData();
      const uploadId = String(form.get("uploadId") || url.searchParams.get("uploadId") || "");
      const index = Number(form.get("index") ?? url.searchParams.get("index") ?? -1);
      const part = form.get("chunk");
      if (!(part instanceof File) || !part.size) return failure(new Error("That part was empty."));
      const stored = await storeUploadPart(uploadId, owner, index, Buffer.from(await part.arrayBuffer()));
      return NextResponse.json({ ok: true, index, ...stored });
    }

    if (action === "status") {
      const found = await getUploadSession(url.searchParams.get("uploadId") || "", owner);
      if (!found) return NextResponse.json({ ok: true, found: false });
      return NextResponse.json({
        ok: true,
        found: true,
        receivedBytes: found.receivedBytes,
        receivedIndexes: found.receivedIndexes,
        fileName: found.fileName,
        fileSize: found.fileSize,
        chunkSize: found.chunkSize,
        totalParts: found.totalParts,
        parallel: UPLOAD_PARALLEL_PARTS,
      });
    }

    if (action === "discard") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      await discardUploadSession(String(body.uploadId || ""), owner);
      return NextResponse.json({ ok: true });
    }

    if (action === "finish") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const { session: upload, buffer } = await readCompletedUpload(String(body.uploadId || ""), owner);
      const video = new File([new Uint8Array(buffer)], upload.fileName, { type: upload.contentType });
      // The parts were written to a private temporary directory unchecked, so
      // the assembled video goes through the malware and file-type gate here,
      // before anything is stored or published.
      const scannedVideo = await scanTutorialVideo(video);
      const id = await saveTutorial({
        scannedVideo,
        toolSlug: body.toolSlug,
        tags: body.tags,
        title: body.title,
        description: body.description,
        status: body.status,
        sortOrder: body.sortOrder,
        languageCode: body.languageCode,
        languageName: body.languageName,
        video,
        createdBy: session.email,
      });
      await discardUploadSession(upload.id, owner);

      after(async () => {
        // Compress first, so the translated tracks are built from the file
        // clients actually stream.
        const compression = await compressStoredTutorialVideo(id).catch((error) => {
          console.error("[tutorial-compression]", error);
          return null;
        });
        if (compression?.changed) console.log("[tutorial-compression]", id, describeSaving(compression));
        await processTutorialLocalisation(id).catch((error) => console.error("[tutorial-localisation]", error));
      });

      await logActivity({ action: "tutorial.save", page: "tutorials", resource_type: "tutorial", resource_id: id, resource_label: String(body.title || "Tutorial") });
      return NextResponse.json({ ok: true, id, tutorials: await listAdminTutorials() }, { status: 201 });
    }

    return failure(new Error("Unknown upload action."));
  } catch (error) {
    return failure(error);
  }
}
