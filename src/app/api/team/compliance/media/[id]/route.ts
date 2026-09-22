import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { getTeamSession } from "@/lib/team-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { complianceUuid } from "@/lib/team-compliance";
import { TEAM_COMPLIANCE_BUCKET } from "@/lib/team-compliance-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = complianceUuid((await params).id);
  if (!id)
    return NextResponse.json(
      { ok: false, error: "Attachment not found." },
      { status: 404 },
    );
  const admin = await getAdminSession();
  const adminCanView =
    !!admin &&
    (admin.role === "super_admin" ||
      hasPermission(admin.permissions, "team_compliance.view") ||
      hasPermission(admin.permissions, "team_compliance.sops.manage"));
  const member = adminCanView ? null : await getTeamSession();
  if (!adminCanView && !member)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );

  const media = await glashMaybeOne<any>(
    `select media.storage_path,media.file_name,s.status,
      exists(select 1 from public.team_compliance_sop_collaborators c where c.sop_id=s.id and c.team_member_id=$2) as collaborator,
      exists(select 1 from public.team_compliance_sop_assignments a where a.sop_id=s.id and (
        a.audience_type='all' or (a.audience_type='member' and a.team_member_id=$2)
        or (a.audience_type='department' and lower(a.department)=lower(coalesce($3,'')))
      )) as assigned
    from public.team_compliance_sop_media media
    join public.team_compliance_sops s on s.id=media.sop_id
    where media.id=$1`,
    [id, member?.id || null, member?.department || ""],
  );
  if (
    !media ||
    (!adminCanView &&
      !media.collaborator &&
      !(media.status === "published" && media.assigned))
  ) {
    return NextResponse.json(
      { ok: false, error: "Attachment not found." },
      { status: 404 },
    );
  }
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage
    .from(TEAM_COMPLIANCE_BUCKET)
    .createSignedUrl(media.storage_path, 60);
  if (error || !data?.signedUrl)
    return NextResponse.json(
      { ok: false, error: "Attachment is unavailable." },
      { status: 500 },
    );
  return NextResponse.redirect(data.signedUrl, 303);
}
