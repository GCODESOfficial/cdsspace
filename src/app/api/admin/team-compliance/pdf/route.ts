import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import {
  buildSopManualPdf,
  sopManualFileName,
  type SopPdfRecord,
} from "@/lib/team-compliance-pdf";
import { complianceText } from "@/lib/team-compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "team_compliance");
  if (denied) return denied;

  const canReadSops =
    session?.role === "super_admin" ||
    hasPermission(session?.permissions || [], "team_compliance.view") ||
    hasPermission(session?.permissions || [], "team_compliance.sops.manage");
  if (!canReadSops) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestedScope = complianceText(
    req.nextUrl.searchParams.get("scope"),
    40,
  );
  const scope = ["all", "general", "task", "department"].includes(
    requestedScope,
  )
    ? requestedScope
    : "all";
  const department = complianceText(
    req.nextUrl.searchParams.get("department"),
    160,
  );

  if (scope === "department" && !department) {
    return NextResponse.json(
      { error: "Choose a department before downloading its SOPs." },
      { status: 400 },
    );
  }

  const params: unknown[] = [];
  let filter = "";
  if (scope === "general" || scope === "task") {
    params.push(scope);
    filter = `where s.scope_type=$${params.length}`;
  } else if (scope === "department") {
    params.push(department);
    filter = `where s.scope_type='department' and lower(s.department)=lower($${params.length})`;
  }

  const sops = await glashQuery<SopPdfRecord>(
    `select s.sop_number, s.title, s.summary, s.content, s.scope_type,
            s.department, s.task_name, s.status, s.version, s.updated_at
       from public.team_compliance_sops s
       ${filter}
      order by case s.scope_type when 'general' then 0 when 'task' then 1 else 2 end,
               lower(coalesce(s.department,'')), s.sop_number, s.updated_at desc
      limit 500`,
    params,
  );

  if (!sops.length) {
    return NextResponse.json(
      { error: "No SOPs are available for this selection." },
      { status: 404 },
    );
  }

  const selectionLabel =
    scope === "department"
      ? `${department} department SOPs`
      : scope === "general"
        ? "Generalist SOPs"
        : scope === "task"
          ? "Dashboard task SOPs"
          : "All SOPs";
  const pdf = buildSopManualPdf(sops, selectionLabel);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sopManualFileName(selectionLabel)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
