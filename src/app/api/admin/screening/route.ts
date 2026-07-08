import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { glashQuery } from "@/lib/glashdb/postgres";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function can(session: AdminSession, key: string) {
  return session.role === "super_admin" || hasPermission(session.permissions, key);
}

async function requireAdmin(key = "applicants.screening") {
  const session = await getAdminSession();
  if (!session) return { session: null, denied: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!can(session, key)) return { session, denied: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  return { session, denied: null as NextResponse | null };
}

// Only surface candidates worth acting on: hide rejected applicants, archived
// applications, and candidates whose role is no longer active. `archivedCond`
// is spliced in so we can gracefully fall back if is_archived isn't migrated.
const listSelect = (archivedCond: string) => `
  select c.id, c.application_id, c.role_id, c.email, c.full_name,
         c.scheduled_at, c.location, c.bring_items, c.instructions,
         c.objective_status, c.objective_score, c.objective_total,
         c.objective_started_at, c.objective_submitted_at, c.termination_reason,
         c.warning_count, c.objective_unlocked,
         c.practical_status, c.practical_score, c.practical_feedback,
         c.interview_status, c.interview_score, c.interview_feedback,
         c.decision, c.created_at, c.updated_at,
         ra.status as application_status, ra.tracking_code,
         r.title as role_title, r.role_type as role_type, r.location as role_location
    from public.screening_candidates c
    join public.role_applications ra on ra.id = c.application_id
    left join public.open_roles r on r.id = c.role_id
   where ra.status <> 'rejected'
     and coalesce(r.is_active, true) = true
     ${archivedCond}
   order by c.scheduled_at asc nulls last, c.created_at desc`;

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  try {
    // Make sure every currently-shortlisted application has a screening row so
    // it shows up here for scheduling. (Terminated candidates keep their row
    // even after reverting to "reviewing", so their history stays visible.)
    await glashQuery(
      `insert into public.screening_candidates (application_id, role_id, email, full_name)
       select ra.id, ra.role_id, lower(ra.email), ra.full_name
         from public.role_applications ra
        where ra.status = 'shortlisted'
          and not exists (
            select 1 from public.screening_candidates c where c.application_id = ra.id
          )
       on conflict (application_id) do nothing`,
    );

    // New candidates inherit their role's saved screening appointment, so an
    // admin who set it once doesn't have to re-do it for later shortlists.
    // Tolerate the table not existing yet (migration applied by hand).
    try {
      await glashQuery(
        `update public.screening_candidates c
            set scheduled_at = s.scheduled_at, location = s.location,
                bring_items = s.bring_items, instructions = s.instructions
           from public.screening_role_schedule s
          where c.role_id = s.role_id and c.scheduled_at is null`,
      );
    } catch { /* role schedule table not migrated yet */ }

    let rows;
    try {
      rows = await glashQuery(listSelect("and coalesce(ra.is_archived, false) = false"));
    } catch (e) {
      // role_applications.is_archived not migrated yet — filter the rest.
      if (e instanceof Error && /is_archived/.test(e.message)) {
        rows = await glashQuery(listSelect(""));
      } else {
        throw e;
      }
    }
    // Per-role schedules (one row per role) so the dashboard can show and edit
    // a single screening appointment + interview for each role group. Tolerate
    // the tables not existing yet - just show none.
    let interviews: unknown[] = [];
    let schedules: unknown[] = [];
    try {
      interviews = await glashQuery(
        `select role_id, interview_at, venue, notes from public.screening_role_interviews`,
      );
    } catch { interviews = []; }
    try {
      schedules = await glashQuery(
        `select role_id, scheduled_at, location, bring_items, instructions from public.screening_role_schedule`,
      );
    } catch { schedules = []; }
    return NextResponse.json({ ok: true, candidates: rows, interviews, schedules });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
  }
}

function clampScore(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const { denied } = await requireAdmin();
  if (denied) return denied;

  // Role-level action: set one screening appointment for the whole role. Saved
  // as the role's source of truth AND copied onto every candidate in the role
  // (so the objective test still unlocks off each candidate's scheduled_at).
  if (action === "set_role_schedule") {
    const roleId = String(body?.role_id || "");
    if (!roleId) return NextResponse.json({ ok: false, error: "Missing role id" }, { status: 400 });
    try {
      const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at).toISOString() : null;
      const location = body.location ? String(body.location) : null;
      const bringItems = body.bring_items ? String(body.bring_items) : null;
      const instructions = body.instructions ? String(body.instructions) : null;
      await glashQuery(
        `insert into public.screening_role_schedule (role_id, scheduled_at, location, bring_items, instructions)
         values ($1, $2, $3, $4, $5)
         on conflict (role_id) do update
            set scheduled_at = excluded.scheduled_at, location = excluded.location,
                bring_items = excluded.bring_items, instructions = excluded.instructions`,
        [roleId, scheduledAt, location, bringItems, instructions],
      );
      // Apply to every candidate currently in the role.
      await glashQuery(
        `update public.screening_candidates
            set scheduled_at = $1, location = $2, bring_items = $3, instructions = $4
          where role_id = $5`,
        [scheduledAt, location, bringItems, instructions, roleId],
      );
      await logActivity({ action: "screening.set_role_schedule", page: "screening", resource_type: "open_role", resource_label: roleId });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
    }
  }

  // Role-level action: set one interview schedule shared by every candidate in
  // the role. Handled before the per-candidate id check below.
  if (action === "set_role_interview") {
    const roleId = String(body?.role_id || "");
    if (!roleId) return NextResponse.json({ ok: false, error: "Missing role id" }, { status: 400 });
    try {
      const interviewAt = body.interview_at ? new Date(body.interview_at).toISOString() : null;
      await glashQuery(
        `insert into public.screening_role_interviews (role_id, interview_at, venue, notes)
         values ($1, $2, $3, $4)
         on conflict (role_id) do update
            set interview_at = excluded.interview_at,
                venue = excluded.venue,
                notes = excluded.notes`,
        [
          roleId,
          interviewAt,
          body.venue ? String(body.venue) : null,
          body.notes ? String(body.notes) : null,
        ],
      );
      await logActivity({ action: "screening.set_role_interview", page: "screening", resource_type: "open_role", resource_label: roleId });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
    }
  }

  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ ok: false, error: "Missing candidate id" }, { status: 400 });

  try {
    if (action === "schedule") {
      const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at).toISOString() : null;
      await glashQuery(
        `update public.screening_candidates
            set scheduled_at = $1, location = $2, bring_items = $3, instructions = $4
          where id = $5`,
        [
          scheduledAt,
          body.location ? String(body.location) : null,
          body.bring_items ? String(body.bring_items) : null,
          body.instructions ? String(body.instructions) : null,
          id,
        ],
      );
      await logActivity({ action: "screening.schedule", page: "screening", resource_type: "screening_candidate", resource_label: id });
      return NextResponse.json({ ok: true });
    }

    if (action === "rate_practical" || action === "rate_interview") {
      const isPractical = action === "rate_practical";
      const score = clampScore(body.score);
      const feedback = body.feedback ? String(body.feedback) : null;
      const col = isPractical ? "practical" : "interview";
      await glashQuery(
        `update public.screening_candidates
            set ${col}_score = $1::int, ${col}_feedback = $2,
                ${col}_status = case when $1::int is null then 'pending' else 'rated' end
          where id = $3`,
        [score, feedback, id],
      );
      await logActivity({ action: `screening.${action}`, page: "screening", resource_type: "screening_candidate", resource_label: `${id} → ${score ?? "-"}` });
      return NextResponse.json({ ok: true });
    }

    if (action === "decision") {
      const decision = String(body.decision || "");
      if (!["in_progress", "passed", "failed"].includes(decision)) {
        return NextResponse.json({ ok: false, error: "Invalid decision" }, { status: 400 });
      }
      await glashQuery(`update public.screening_candidates set decision = $1 where id = $2`, [decision, id]);
      // Optionally cascade to the application record.
      if (body.update_application) {
        const appStatus = decision === "passed" ? "hired" : decision === "failed" ? "rejected" : null;
        if (appStatus) {
          await glashQuery(
            `update public.role_applications ra
                set status = $1
               from public.screening_candidates c
              where c.id = $2 and ra.id = c.application_id`,
            [appStatus, id],
          );
        }
      }
      await logActivity({ action: "screening.decision", page: "screening", resource_type: "screening_candidate", resource_label: `${id} → ${decision}` });
      return NextResponse.json({ ok: true });
    }

    if (action === "start_objective" || action === "lock_objective") {
      const unlock = action === "start_objective";
      await glashQuery(`update public.screening_candidates set objective_unlocked = $1 where id = $2`, [unlock, id]);
      await logActivity({ action: `screening.${action}`, page: "screening", resource_type: "screening_candidate", resource_label: id });
      return NextResponse.json({ ok: true });
    }

    if (action === "reshortlist") {
      // Allow a terminated/reviewing candidate another attempt: re-shortlist
      // the application and reset the objective test.
      await glashQuery(
        `update public.role_applications ra
            set status = 'shortlisted'
           from public.screening_candidates c
          where c.id = $1 and ra.id = c.application_id`,
        [id],
      );
      await glashQuery(
        `update public.screening_candidates
            set objective_status = 'not_started', objective_score = null, objective_total = null,
                objective_started_at = null, objective_deadline = null, objective_submitted_at = null,
                termination_reason = null, warning_count = 0, objective_unlocked = false
          where id = $1`,
        [id],
      );
      await glashQuery(`delete from public.screening_answers where candidate_id = $1`, [id]);
      await logActivity({ action: "screening.reshortlist", page: "screening", resource_type: "screening_candidate", resource_label: id });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
  }
}
