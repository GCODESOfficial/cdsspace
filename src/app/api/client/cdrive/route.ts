import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { cleanDriveName } from "@/lib/cdrive";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const drives = await glashQuery(
    `select drive.id, drive.name, drive.description, drive.project_id, drive.created_by_kind,
            drive.shared_with_admin,
            (drive.created_by_kind = 'client' and drive.created_by_id = $1::text) as can_manage_admin_sharing,
            drive.status, drive.created_at, drive.updated_at, member.access_level,
            (select count(*)::int from public.client_drive_files file where file.drive_id = drive.id) as file_count,
            (select count(*)::int from public.client_drive_folders folder where folder.drive_id = drive.id) as folder_count
       from public.client_drive_members member
       join public.client_drives drive on drive.id = member.drive_id
      where member.client_user_id = $1::uuid and drive.status = 'active'
      order by drive.updated_at desc`,
    [account.user.id],
  );
  return NextResponse.json({ ok: true, drives });
}

export async function POST(req: Request) {
  const account = await getClientAccountState();
  if (!account?.agreement) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = cleanDriveName(body.name);
  const description = String(body.description || "").trim().slice(0, 1200) || null;
  const sharedWithAdmin = body.shareWithAdmin === true;
  const rows = await glashQuery<{ id: string }>(
    `with drive as (
       insert into public.client_drives (name, description, created_by_kind, created_by_id, shared_with_admin)
       values ($1, $2, 'client', $3, $4) returning id
     )
     insert into public.client_drive_members (drive_id, client_user_id, access_level, shared_by)
     select id, $3::uuid, 'edit', $3 from drive
     returning drive_id as id`,
    [name, description, account.user.id, sharedWithAdmin],
  );
  return NextResponse.json({ ok: true, id: rows[0]?.id }, { status: 201 });
}
