/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { getTeamSession } from "@/lib/team-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { validateChatUpload } from "@/lib/chat-upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload a task-assignment attachment (photo/file) → returns a public URL the
 * assign form saves onto the task. Lead/sub-admin only, same as who can assign.
 */
export async function POST(req: Request) {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const me = await glashMaybeOne<{ is_sub_admin: boolean; is_team_lead: boolean }>(
    `select is_sub_admin, coalesce(is_team_lead, false) as is_team_lead from public.team_members where id = $1`,
    [session.id],
  ).catch(() => null);
  if (!me || (!me.is_sub_admin && !me.is_team_lead)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const db = getGlashDbAdmin() as any;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }
    // Authoritative size/type limits (images/videos/pdf/docs). Never trust client.
    const check = validateChatUpload(file.size, file.type || "");
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 413 });

    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `task-attachments/${Math.random().toString(36).slice(2)}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await db.storage
      .from("media")
      .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
    if (error) throw error;

    const { data } = db.storage.from("media").getPublicUrl(path);
    return NextResponse.json({ ok: true, url: data.publicUrl, name: file.name });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Upload failed" }, { status: 500 });
  }
}
