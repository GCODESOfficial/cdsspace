import { NextRequest, NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { complianceUuid } from "@/lib/team-compliance";
import {
  uploadSopMedia,
  UploadSecurityError,
} from "@/lib/team-compliance-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req))
    return NextResponse.json(
      { ok: false, error: "Untrusted request origin." },
      { status: 403 },
    );
  const member = await getTeamSession();
  if (!member)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const sopId = complianceUuid(form?.get("sop_id"));
  if (!(file instanceof File) || !sopId)
    return NextResponse.json(
      { ok: false, error: "Choose an image or video and a valid SOP." },
      { status: 400 },
    );
  const access = await glashMaybeOne(
    `select c.sop_id from public.team_compliance_sop_collaborators c
      where c.sop_id=$1 and c.team_member_id=$2 and c.can_edit=true`,
    [sopId, member.id],
  );
  if (!access)
    return NextResponse.json(
      { ok: false, error: "You were not invited to edit this SOP." },
      { status: 403 },
    );
  try {
    const media = await uploadSopMedia({
      file,
      sopId,
      actor: member.full_name,
      memberId: member.id,
    });
    return NextResponse.json({ ok: true, media });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Attachment upload failed.",
      },
      { status: error instanceof UploadSecurityError ? error.status : 500 },
    );
  }
}
