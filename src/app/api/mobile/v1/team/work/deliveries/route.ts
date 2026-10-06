import { glashQuery } from "@/lib/glashdb/postgres";
import { mobileJson } from "@/lib/mobile-api";
import { getTeamSession } from "@/lib/team-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The app's delivery drafts list. Same rows and order as GET /api/team/deliveries,
// plus drafts opened straight from a taskboard task (/api/taskboard/delivery):
// those have no design request behind them, so the web list's inner join hides
// them even though /api/team/deliveries already lets their assignees save,
// upload and submit them. Writes still go through /api/team/deliveries.
export async function GET() {
  const member = await getTeamSession();
  if (!member) return mobileJson({ ok: false, error: "Unauthorized" }, 401);
  try {
    const deliveries = await glashQuery(
      `select d.id, d.title, d.description, d.status, d.external_url, d.updated_at,
              d.source_task_id,
              r.display_id as work_code, r.category,
              coalesce(files.file_count, 0)::int as file_count,
              coalesce(files.files, '[]'::jsonb) as files
         from public.client_deliveries d
         left join public.design_requests r on r.id = d.source_design_request_id
         left join lateral (
           select count(*)::int as file_count,
                  jsonb_agg(jsonb_build_object(
                    'id', f.id, 'file_name', f.file_name,
                    'relative_path', coalesce(f.relative_path, f.file_name),
                    'file_size', f.file_size, 'file_kind', f.file_kind
                  ) order by f.position, f.created_at) as files
             from public.client_delivery_files f where f.delivery_id = d.id
         ) files on true
        where (r.id is not null or d.source_task_id is not null)
          and (
            d.assigned_team_lead_id = $1
            or exists (select 1 from public.task_board_task_assignees a where a.task_id = r.task_id and a.team_member_id = $1)
            or exists (select 1 from public.project_assignments a where a.project_id = r.project_id and a.team_member_id = $1)
            or exists (select 1 from public.task_board_task_assignees a where a.task_id = d.source_task_id and a.team_member_id = $1)
          )
        order by case d.status when 'revision_requested' then 0 when 'assigned' then 1 when 'draft' then 2 when 'submitted' then 3 else 4 end,
                 d.updated_at desc`,
      [member.id],
    );
    return mobileJson({ ok: true, deliveries });
  } catch (error) {
    console.error("[mobile team deliveries GET]", error);
    return mobileJson({ ok: false, error: "Could not load delivery drafts." }, 500);
  }
}
