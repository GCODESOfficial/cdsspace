import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { cleanDriveName } from "@/lib/cdrive";
import { getGlashPoolClient, glashQuery } from "@/lib/glashdb/postgres";
import { getUnifiedClientDirectory } from "@/lib/client-directory-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actor() {
  const session = await getAdminSession();
  if (!session) return null;
  if (session.role !== "super_admin" && !hasPermission(session.permissions || [], "deliveries")) return null;
  return session;
}

export async function GET() {
  const session = await actor();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const [drives, directory] = await Promise.all([
    glashQuery(
      `select drive.id, drive.name, drive.description, drive.project_id, drive.created_by_kind,
              drive.shared_with_admin,
              drive.status, drive.created_at, drive.updated_at,
              coalesce(jsonb_agg(jsonb_build_object(
                'id', profile.id, 'name', coalesce(profile.full_name, profile.company_name, profile.email),
                'email', profile.email, 'accessLevel', member.access_level
              ) order by profile.full_name) filter (where profile.id is not null), '[]'::jsonb) as clients,
              (select count(*)::int from public.client_drive_files file where file.drive_id = drive.id) as file_count
         from public.client_drives drive
         left join public.client_drive_members member on member.drive_id = drive.id
         left join public.profiles profile on profile.id = member.client_user_id
        where drive.created_by_kind = 'admin' or drive.shared_with_admin = true
        group by drive.id order by drive.updated_at desc`,
    ),
    getUnifiedClientDirectory(),
  ]);
  const seen = new Set<string>();
  const clients = directory.clients.flatMap((client) => {
    const id = client.platform_user_id;
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: client.brand_name || client.name, email: client.email }];
  });
  return NextResponse.json({ ok: true, drives, clients });
}

export async function POST(req: Request) {
  const session = await actor();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const clientIds = Array.from(new Set((Array.isArray(body.clientIds) ? body.clientIds : []).map(String).filter(Boolean)));
  if (!clientIds.length) return NextResponse.json({ ok: false, error: "Select at least one client" }, { status: 400 });
  const accessLevel = body.accessLevel === "edit" ? "edit" : "view";
  const name = cleanDriveName(body.name);
  const description = String(body.description || "").trim().slice(0, 1200) || null;
  const client = await getGlashPoolClient();
  try {
    await client.query("begin");
    const valid = await client.query<{ id: string }>(`select id from public.profiles where id = any($1::uuid[])`, [clientIds]);
    if (valid.rows.length !== clientIds.length) throw new Error("One or more selected clients no longer exist.");
    const driveResult = await client.query<{ id: string }>(
      `insert into public.client_drives (name, description, project_id, created_by_kind, created_by_id, shared_with_admin)
       values ($1, $2, $3::uuid, 'admin', $4, true) returning id`,
      [name, description, body.projectId || null, session.email],
    );
    const driveId = driveResult.rows[0].id;
    await client.query(
      `insert into public.client_drive_members (drive_id, client_user_id, access_level, shared_by)
       select $1::uuid, unnest($2::uuid[]), $3, $4`,
      [driveId, clientIds, accessLevel, session.email],
    );
    await client.query("commit");
    return NextResponse.json({ ok: true, id: driveId }, { status: 201 });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create drive" }, { status: 400 });
  } finally {
    client.release();
  }
}
