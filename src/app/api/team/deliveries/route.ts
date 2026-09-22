import { after, NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  DeliveryWorkflowError,
  getClientDelivery,
  planClientDeliveryFileRemoval,
  removeClientDeliveryFiles,
  submitClientDelivery,
  uploadClientDeliveryFiles,
} from "@/lib/client-deliveries-server";
import { isGoogleDeliverableUrl } from "@/lib/client-deliveries";
import { notifyAdminFeatureEvent } from "@/lib/admin-feature-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f-]{36}$/i;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function canAccess(memberId: string, deliveryId: string) {
  return glashMaybeOne<{ id: string }>(
    `select d.id
       from public.client_deliveries d
       left join public.design_requests r on r.id = d.source_design_request_id
      where d.id = $1
        and (
          d.assigned_team_lead_id = $2
          or exists (select 1 from public.task_board_task_assignees a where a.task_id = r.task_id and a.team_member_id = $2)
          or exists (select 1 from public.project_assignments a where a.project_id = r.project_id and a.team_member_id = $2)
          -- A delivery raised straight from a taskboard task has no design
          -- request behind it, so its access comes from that task's assignees.
          or exists (select 1 from public.task_board_task_assignees a where a.task_id = d.source_task_id and a.team_member_id = $2)
        )
      limit 1`,
    [deliveryId, memberId],
  );
}

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof DeliveryWorkflowError ? error.status : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

export async function GET() {
  const member = await getTeamSession();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const deliveries = await glashQuery(
      `select d.id, d.title, d.description, d.status, d.external_url, d.updated_at,
              r.display_id as work_code, r.category,
              coalesce(files.file_count, 0)::int as file_count,
              coalesce(files.files, '[]'::jsonb) as files
         from public.client_deliveries d
         join public.design_requests r on r.id = d.source_design_request_id
         left join lateral (
           select count(*)::int as file_count,
                  jsonb_agg(jsonb_build_object(
                    'id', f.id, 'file_name', f.file_name,
                    'relative_path', coalesce(f.relative_path, f.file_name),
                    'file_size', f.file_size, 'file_kind', f.file_kind
                  ) order by f.position, f.created_at) as files
             from public.client_delivery_files f where f.delivery_id = d.id
         ) files on true
        where d.assigned_team_lead_id = $1
           or exists (select 1 from public.task_board_task_assignees a where a.task_id = r.task_id and a.team_member_id = $1)
           or exists (select 1 from public.project_assignments a where a.project_id = r.project_id and a.team_member_id = $1)
        order by case d.status when 'revision_requested' then 0 when 'assigned' then 1 when 'draft' then 2 when 'submitted' then 3 else 4 end,
                 d.updated_at desc`,
      [member.id],
    );
    return NextResponse.json({ deliveries });
  } catch (error) {
    console.error("[team deliveries GET]", error);
    return NextResponse.json({ error: "Could not load delivery drafts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const member = await getTeamSession();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const deliveryId = clean(form.get("delivery_id"), 50);
    if (!UUID.test(deliveryId) || !(await canAccess(member.id, deliveryId))) {
      return NextResponse.json({ error: "Delivery draft not found." }, { status: 404 });
    }
    const delivery = await getClientDelivery(deliveryId);
    if (!delivery || !["draft", "assigned", "revision_requested"].includes(delivery.status)) {
      return NextResponse.json({ error: "This delivery is not open for uploads." }, { status: 409 });
    }
    const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    const relativePaths = form.getAll("relative_paths").map(String);
    if (!files.length) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
    await uploadClientDeliveryFiles(delivery, files, relativePaths);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not upload the delivery files.");
  }
}

export async function PATCH(request: Request) {
  const member = await getTeamSession();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const deliveryId = clean(body.delivery_id, 50);
    if (!UUID.test(deliveryId) || !(await canAccess(member.id, deliveryId))) {
      return NextResponse.json({ error: "Delivery draft not found." }, { status: 404 });
    }
    const delivery = await getClientDelivery(deliveryId);
    if (!delivery) return NextResponse.json({ error: "Delivery draft not found." }, { status: 404 });
    if (!["draft", "assigned", "revision_requested"].includes(delivery.status)) {
      return NextResponse.json({ error: "This delivery is already under review." }, { status: 409 });
    }

    if (body.action === "remove_files") {
      const ids = Array.isArray(body.file_ids) ? body.file_ids.map(String).filter((id: string) => UUID.test(id)) : [];
      const planned = await planClientDeliveryFileRemoval({
        deliveryId,
        fileIds: ids,
        hasExternalUrl: Boolean(delivery.external_url),
      });
      await removeClientDeliveryFiles(deliveryId, planned);
      return NextResponse.json({ ok: true });
    }

    const title = clean(body.title, 180) || delivery.title;
    const description = clean(body.description, 4000);
    const externalUrl = clean(body.external_url, 1000);
    if (externalUrl && !isGoogleDeliverableUrl(externalUrl)) {
      return NextResponse.json({ error: "Use a valid Google Drive or Google Docs link." }, { status: 400 });
    }
    await glashQuery(
      `update public.client_deliveries
          set title=$2, description=$3, external_url=$4,
              status=case when status='assigned' then 'draft' else status end,
              updated_at=now()
        where id=$1`,
      [deliveryId, title, description || null, externalUrl || null],
    );

    if (body.action === "submit") {
      await submitClientDelivery({ id: deliveryId, externalUrl: externalUrl || null, teamMemberId: member.id });
      after(async () => {
        await notifyAdminFeatureEvent({
          permissionKeys: ["deliveries"],
          departmentNames: ["Design", "Creative"],
          title: "Design ready for internal review",
          body: `${title} was submitted by ${member.full_name}. Review it before it reaches the client.`,
          link: "/admin/clients/deliveries",
          teamLink: "/team/deliveries",
          eyebrow: "Delivery review",
          details: { "Work code": clean(body.work_code, 40), "Submitted by": member.full_name },
        });
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not update the delivery draft.");
  }
}
