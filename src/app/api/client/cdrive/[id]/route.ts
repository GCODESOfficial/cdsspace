import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { cleanDriveName, getClientDriveAccess, loadDriveContents, uploadDriveFile } from "@/lib/cdrive";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { CLIENT_STORAGE_FULL_CODE, isClientStorageFullError } from "@/lib/client-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function context(id: string) {
  const account = await getClientAccountState();
  if (!account?.agreement) return null;
  const access = await getClientDriveAccess(id, account.user.id).catch(() => null);
  return access ? { account, access } : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await context(id);
  if (!auth) return NextResponse.json({ ok: false, error: "Drive not found" }, { status: 404 });
  const drive = await glashMaybeOne(
    `select id, public_token, name, description, project_id, created_by_kind, shared_with_admin,
            (created_by_kind = 'client' and created_by_id = $2::text) as can_manage_admin_sharing,
            status, created_at, updated_at
       from public.client_drives
      where id = $1::uuid`,
    [id, auth.account.user.id],
  );
  return NextResponse.json({ ok: true, drive: { ...drive, access_level: auth.access.access_level }, ...(await loadDriveContents(id)) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await context(id);
  if (!auth) return NextResponse.json({ ok: false, error: "Drive not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.sharedWithAdmin !== "boolean") {
    return NextResponse.json({ ok: false, error: "Choose whether to share this drive with CDS Admin." }, { status: 400 });
  }
  const updated = await glashMaybeOne<{ shared_with_admin: boolean }>(
    `update public.client_drives
        set shared_with_admin = $3, updated_at = now()
      where id = $1::uuid
        and created_by_kind = 'client'
        and created_by_id = $2::text
      returning shared_with_admin`,
    [id, auth.account.user.id, body.sharedWithAdmin],
  );
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Only the client who created this drive can change CDS Admin access." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, sharedWithAdmin: updated.shared_with_admin });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await context(id);
  if (!auth) return NextResponse.json({ ok: false, error: "Drive not found" }, { status: 404 });
  if (auth.access.access_level !== "edit") return NextResponse.json({ ok: false, error: "This drive is view-only" }, { status: 403 });
  const form = await req.formData();
  const action = String(form.get("action") || "upload");
  try {
    if (action === "folder") {
      const name = cleanDriveName(form.get("name"), "New folder");
      const parentId = String(form.get("parentId") || "") || null;
      if (parentId) {
        const parent = await glashMaybeOne(`select id from public.client_drive_folders where id = $1::uuid and drive_id = $2::uuid`, [parentId, id]);
        if (!parent) return NextResponse.json({ ok: false, error: "Parent folder not found" }, { status: 400 });
      }
      const [folder] = await glashQuery(
        `insert into public.client_drive_folders (drive_id, parent_id, name, created_by_kind, created_by_id)
         values ($1::uuid, $2::uuid, $3, 'client', $4) returning id, parent_id, name, created_at`,
        [id, parentId, name, auth.account.user.id],
      );
      await glashQuery(`update public.client_drives set updated_at = now() where id = $1::uuid`, [id]);
      return NextResponse.json({ ok: true, folder }, { status: 201 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file" }, { status: 400 });
    const result = await uploadDriveFile({
      driveId: id,
      folderId: String(form.get("folderId") || "") || null,
      file,
      actorKind: "client",
      actorId: auth.account.user.id,
    });
    await glashQuery(`update public.client_drives set updated_at = now() where id = $1::uuid`, [id]);
    return NextResponse.json({ ok: true, file: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "cDrive update failed",
      ...(isClientStorageFullError(error) ? { code: CLIENT_STORAGE_FULL_CODE } : {}),
    }, { status: isClientStorageFullError(error) ? 409 : 400 });
  }
}
