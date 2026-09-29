import { NextRequest, NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { assertSafeUpload, UploadSecurityError } from "@/lib/upload-security";
import {
  canEditBoard,
  getTaskboardViewer,
  logTaskboardActivity,
  requireTaskAccess,
  type TaskboardPortal,
} from "@/lib/taskboard/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

function cleanFileName(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "-").replace(/-+/g, "-").slice(-120) || "attachment";
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Upload could not be read." }, { status: 400 });

  const portal: TaskboardPortal = form.get("portal") === "team" ? "team" : "admin";
  const viewer = await getTaskboardViewer(portal);
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const taskId = String(form.get("task_id") || "");
  const file = form.get("file") as File | null;
  if (!taskId || !file) {
    return NextResponse.json({ ok: false, error: "Task and file are required." }, { status: 400 });
  }
  const declaredVideo = file.type.startsWith("video/");
  const maxBytes = declaredVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json({ ok: false, error: declaredVideo ? "Videos must be 150MB or smaller." : "Attachments must be 20MB or smaller." }, { status: 413 });
  }

  const task = await requireTaskAccess(viewer, taskId);
  if (!task || !(await canEditBoard(viewer, task.board_id))) {
    return NextResponse.json({ ok: false, error: "Task not found or access denied." }, { status: 403 });
  }

  try {
    const db = getGlashDbAdmin() as any;
    const safe = await assertSafeUpload(file, { allow: ["image", "pdf", "office", "zip", "design"], maxBytes });
    if (!safe.contentType.startsWith("video/") && safe.buffer.byteLength > MAX_FILE_BYTES) {
      throw new UploadSecurityError("Non-video task attachments must be 20MB or smaller.", 413);
    }
    const safeName = cleanFileName(file.name.replace(/\.[^.]+$/, ""));
    const storagePath = `taskboards/${task.board_id}/${task.id}/${crypto.randomUUID()}-${safeName}.${safe.ext}`;
    const { error } = await db.storage
      .from("media")
      .upload(storagePath, safe.buffer, {
        contentType: safe.contentType,
        upsert: false,
      });
    if (error) throw new Error(error.message);

    const { data } = db.storage.from("media").getPublicUrl(storagePath);
    const attachment = await glashMaybeOne(
      `insert into public.task_board_attachments
        (task_id, kind, title, url, storage_path, mime_type, size_bytes, created_by_kind, created_by_id)
       values ($1,'upload',$2,$3,$4,$5,$6,$7,$8)
       returning *`,
      [
        task.id,
        file.name.slice(0, 180),
        data.publicUrl,
        storagePath,
        safe.contentType,
        safe.buffer.length,
        viewer.kind,
        viewer.id,
      ],
    );
    await logTaskboardActivity(viewer, {
      boardId: task.board_id,
      taskId: task.id,
      eventType: "attachment_uploaded",
      detail: `Uploaded ${file.name}`,
    });
    return NextResponse.json({ ok: true, attachment });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed." },
      { status: error instanceof UploadSecurityError ? error.status : 500 },
    );
  }
}
