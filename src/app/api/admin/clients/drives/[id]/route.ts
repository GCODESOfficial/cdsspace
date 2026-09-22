import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { cleanDriveName, loadDriveContents, uploadDriveFile } from "@/lib/cdrive";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";

async function actor() {
  const session = await getAdminSession();
  if (!session) return null;
  return session.role === "super_admin" || hasPermission(session.permissions || [], "deliveries") ? session : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await actor();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const drive = await glashMaybeOne(`select id, name, description, project_id, status, created_at, updated_at from public.client_drives where id = $1::uuid`, [id]);
  if (!drive) return NextResponse.json({ ok: false, error: "Drive not found" }, { status: 404 });
  return NextResponse.json({ ok: true, drive, ...(await loadDriveContents(id)) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await actor();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body.members)) {
    for (const member of body.members) {
      const clientId = String(member?.clientId || "");
      if (!clientId) continue;
      const level = member?.accessLevel === "edit" ? "edit" : "view";
      await glashQuery(
        `insert into public.client_drive_members (drive_id, client_user_id, access_level, shared_by)
         values ($1::uuid, $2::uuid, $3, $4)
         on conflict (drive_id, client_user_id) do update set access_level = excluded.access_level, shared_by = excluded.shared_by, updated_at = now()`,
        [id, clientId, level, session.email],
      );
    }
  }
  await glashQuery(
    `update public.client_drives set name = coalesce($2, name), description = coalesce($3, description), updated_at = now() where id = $1::uuid`,
    [id, body.name == null ? null : cleanDriveName(body.name), body.description == null ? null : String(body.description).trim().slice(0, 1200)],
  );
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await actor();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const drive = await glashMaybeOne(`select id from public.client_drives where id = $1::uuid`, [id]);
  if (!drive) return NextResponse.json({ ok: false, error: "Drive not found" }, { status: 404 });
  const form = await req.formData();
  const action = String(form.get("action") || "upload");
  try {
    if (action === "folder") {
      const [folder] = await glashQuery(
        `insert into public.client_drive_folders (drive_id, parent_id, name, created_by_kind, created_by_id)
         values ($1::uuid, $2::uuid, $3, 'admin', $4) returning id, parent_id, name, created_at`,
        [id, String(form.get("parentId") || "") || null, cleanDriveName(form.get("name"), "New folder"), session.email],
      );
      return NextResponse.json({ ok: true, folder }, { status: 201 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file" }, { status: 400 });
    const result = await uploadDriveFile({ driveId: id, folderId: String(form.get("folderId") || "") || null, file, actorKind: "admin", actorId: session.email });
    await glashQuery(`update public.client_drives set updated_at = now() where id = $1::uuid`, [id]);
    return NextResponse.json({ ok: true, file: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "cDrive update failed" }, { status: 400 });
  }
}
