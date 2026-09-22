import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
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
  const { session, denied } = await requireAdmin(
    req,
    "team_compliance.sops.manage",
  );
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const sopId = complianceUuid(form?.get("sop_id"));
  if (!(file instanceof File) || !sopId)
    return NextResponse.json(
      { ok: false, error: "Choose an image or video and a valid SOP." },
      { status: 400 },
    );
  const sop = await glashMaybeOne(
    `select id from public.team_compliance_sops where id=$1`,
    [sopId],
  );
  if (!sop)
    return NextResponse.json(
      { ok: false, error: "SOP not found." },
      { status: 404 },
    );
  try {
    const media = await uploadSopMedia({
      file,
      sopId,
      actor: session?.name || session?.email || "Administrator",
      memberId: session?.memberId,
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
