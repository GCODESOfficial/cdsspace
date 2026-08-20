import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { getTeamSession } from "@/lib/team-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AttachmentRow = {
  id: string;
  team_member_id: string;
  source_kind: "cdoc" | "protected" | "external" | "upload";
  source_id: string | null;
  external_url: string | null;
  storage_path: string | null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  const adminCanView = admin && (admin.role === "super_admin"
    || hasPermission(admin.permissions, "team_reports")
    || hasPermission(admin.permissions, "team_reports.view"));
  if (!team && !adminCanView) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const attachment = await glashMaybeOne<AttachmentRow>(
    `select id, team_member_id, source_kind, source_id, external_url, storage_path
       from public.team_work_tracking_self_report_attachments
      where id = $1::uuid
      limit 1`,
    [id],
  ).catch(() => null);
  if (!attachment || (team && attachment.team_member_id !== team.id)) {
    return NextResponse.json({ ok: false, error: "Attachment not found." }, { status: 404 });
  }

  if (attachment.source_kind === "external" && attachment.external_url) {
    return NextResponse.redirect(attachment.external_url, 303);
  }
  if (attachment.source_kind === "cdoc" && attachment.source_id) {
    if (team) {
      const db = getGlashDbAdmin() as any;
      const { data: ownedDocument } = await db
        .from("team_cdocs")
        .select("id")
        .eq("id", attachment.source_id)
        .eq("created_by", team.id)
        .maybeSingle();
      if (!ownedDocument) return NextResponse.json({ ok: false, error: "Attachment not found." }, { status: 404 });
    }
    return NextResponse.redirect(new URL(admin ? `/admin/cdocs?doc=${attachment.source_id}` : `/team/cdocs/${attachment.source_id}`, req.url), 303);
  }
  if (attachment.source_kind === "protected" && attachment.source_id) {
    if (team) {
      const db = getGlashDbAdmin() as any;
      const { data: ownedDocument } = await db
        .from("team_protected_documents")
        .select("id")
        .eq("id", attachment.source_id)
        .eq("uploaded_by", team.id)
        .maybeSingle();
      if (!ownedDocument) return NextResponse.json({ ok: false, error: "Attachment not found." }, { status: 404 });
    }
    return NextResponse.redirect(new URL(admin ? `/admin/protect-docs?doc=${attachment.source_id}` : `/team/protect-docs?doc=${attachment.source_id}`, req.url), 303);
  }
  if (attachment.source_kind === "upload" && attachment.storage_path) {
    const db = getGlashDbAdmin() as any;
    const { data, error } = await db.storage.from("team-report-attachments").createSignedUrl(attachment.storage_path, 60);
    if (error || !data?.signedUrl) return NextResponse.json({ ok: false, error: "The PDF could not be opened." }, { status: 500 });
    return NextResponse.redirect(data.signedUrl, 303);
  }
  return NextResponse.json({ ok: false, error: "Attachment is unavailable." }, { status: 404 });
}
