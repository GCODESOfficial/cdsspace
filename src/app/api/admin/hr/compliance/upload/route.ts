import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { hrDateOnly, hrText, hrUuid, isHrRecordStatus, isHrRecordType } from "@/lib/hr-personnel";
import { uploadHrPersonnelRecord, UploadSecurityError } from "@/lib/hr-personnel-storage";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin." }, { status: 403 });
  const { session, denied } = await requireAdmin(req, "hr_compliance.manage");
  if (denied || !session) return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const teamMemberId = hrUuid(form?.get("team_member_id"));
  const recordType = form?.get("record_type");
  const title = hrText(form?.get("title"), 220);
  const summary = hrText(form?.get("summary"), 10000);
  const eventDate = hrDateOnly(form?.get("event_date")) || new Date().toISOString().slice(0, 10);
  const effectiveDate = form?.get("effective_date") ? hrDateOnly(form.get("effective_date")) : null;
  const statusValue = form?.get("status");
  const status = isHrRecordStatus(statusValue) ? statusValue : "issued";
  if (!(file instanceof File) || !teamMemberId || !isHrRecordType(recordType) || !title) {
    return NextResponse.json({ ok: false, error: "Choose a file, team member, record type, and title." }, { status: 400 });
  }
  if (recordType === "bank_statement" && session.role !== "super_admin" && !hasPermission(session.permissions || [], "hr_compliance.financial")) {
    return NextResponse.json({ ok: false, error: "You do not have permission to manage bank statements." }, { status: 403 });
  }
  const member = await glashMaybeOne<{ full_name: string }>("select full_name from public.team_members where id=$1", [teamMemberId]);
  if (!member) return NextResponse.json({ ok: false, error: "Team member not found." }, { status: 404 });
  try {
    const record = await uploadHrPersonnelRecord({
      file,
      teamMemberId,
      recordType,
      title,
      summary,
      status,
      eventDate,
      effectiveDate,
      dueAt: form?.get("due_at") ? new Date(String(form.get("due_at"))).toISOString() : null,
      signedAt: form?.get("signed_at") ? new Date(String(form.get("signed_at"))).toISOString() : null,
      actor: session.name || session.email || "Administrator",
    });
    const key = session.memberId || String(session.email || "administrator").trim().toLowerCase();
    await glashQuery(
      `delete from public.hr_personnel_record_drafts where actor_key=$1`,
      [key],
    );
    await logActivity({ action: "hr.record.upload", page: "hr-compliance", resource_type: "hr_personnel_record", resource_id: String(record.id), resource_label: `${member.full_name}: ${title}`, metadata: { record_type: recordType, file_name: record.file_name } });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not upload the HR document." }, { status: error instanceof UploadSecurityError ? error.status : 500 });
  }
}
