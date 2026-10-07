/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getChatViewer, viewerMemberId } from "@/lib/team-chat-auth";
import { canViewTeamThread, getTeamChatDb } from "@/lib/team-chat-server";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertSafeImage, UploadSecurityError } from "@/lib/upload-security";

export const runtime = "nodejs";

const PHOTO_MAX_BYTES = 4 * 1024 * 1024; // 4MB, as profile photos

// POST - set a group chat's photo (multipart: file, threadId). As WhatsApp: anyone in
// the group may change it, and admins and management may change any group's.
// Kept in team_chat_threads.settings.avatar_url, so no new column is needed.
export async function POST(req: Request) {
  const viewer = await getChatViewer();
  const db = getTeamChatDb();
  if (!viewer || !db) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const threadId = String(formData.get("threadId") || "");
    const file = formData.get("file");
    if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const thread = await glashMaybeOne<{ kind: string }>("select kind from public.team_chat_threads where id = $1", [threadId]);
    if (!thread) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    if (thread.kind === "direct") {
      return NextResponse.json({ ok: false, error: "Only groups have a group photo." }, { status: 400 });
    }

    const memberId = viewerMemberId(viewer);
    const isManagement = viewer.kind === "admin" || (viewer.kind === "team" && !!viewer.session.is_sub_admin);
    const participant = memberId
      ? await glashMaybeOne("select 1 from public.team_chat_participants where thread_id = $1 and team_member_id = $2", [threadId, memberId])
      : null;
    if (!(await canViewTeamThread(viewer, threadId)) || (!participant && !isManagement)) {
      return NextResponse.json({ ok: false, error: "Only people in this group can change its photo." }, { status: 403 });
    }

    // Security gate: sniffs magic bytes and re-encodes the image from decoded pixels.
    const safe = await assertSafeImage(file as File, { maxBytes: PHOTO_MAX_BYTES });
    const filePath = `chat-groups/${threadId}-${Date.now()}.${safe.ext}`;
    const { error: uploadError } = await db.storage
      .from("media")
      .upload(filePath, safe.buffer, { contentType: safe.contentType, upsert: true });
    if (uploadError) throw uploadError;
    const {
      data: { publicUrl },
    } = db.storage.from("media").getPublicUrl(filePath);

    await glashQuery(
      `update public.team_chat_threads
          set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('avatar_url', $1::text),
              updated_at = now()
        where id = $2`,
      [publicUrl, threadId],
    );

    return NextResponse.json({ ok: true, avatar_url: publicUrl });
  } catch (err: any) {
    if (err instanceof UploadSecurityError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error("Group photo upload error:", err);
    return NextResponse.json({ ok: false, error: "Could not upload the group photo." }, { status: 500 });
  }
}
