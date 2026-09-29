import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { birthdayDistance, hrDateOnly, hrUuid } from "@/lib/hr-personnel";
import { logActivity } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canSeeFinancial(session: { role?: string; permissions?: string[] } | null) {
  if (session?.role === "super_admin") return true;
  const permissions = session?.permissions || [];
  return hasPermission(permissions, "hr_compliance.financial")
    || hasPermission(permissions, "finance_payroll.view")
    || hasPermission(permissions, "team_members.edit_bank");
}

function canSeeHrRecords(session: { role?: string; permissions?: string[] } | null) {
  return session?.role === "super_admin" || hasPermission(session?.permissions || [], "hr_compliance.view");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireAdmin(req, "team_members.view");
  if (denied || !session) return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: rawId } = await params;
  const id = hrUuid(rawId);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid team member." }, { status: 400 });

  try {
    const member = await glashMaybeOne<Record<string, unknown>>(
      `select id, full_name, email, username, avatar_url, role_title, department, phone, location, bio,
              is_active, is_sub_admin, is_team_lead, permissions, joined_at, created_at, updated_at,
              work_mode, date_of_birth, birthday_reminder_enabled, birthday_reminder_days,
              birthday_last_celebrated_year, birthday_last_celebrated_at,
              bank_name, bank_code, account_number, account_name, base_salary, salary_currency, pay_cycle
         from public.team_members where id=$1 limit 1`,
      [id],
    );
    if (!member) return NextResponse.json({ ok: false, error: "Team member not found." }, { status: 404 });

    const [workSummary, attendance, sessions, groups, leave, payrollProfile, faceProfile, equipment] = await Promise.all([
      glashMaybeOne<Record<string, unknown>>(
        `select
           coalesce(sum(total_work_minutes),0)::int as total_minutes,
           coalesce(sum(total_work_minutes) filter (where work_date >= (current_date - ((extract(isodow from current_date)::int) - 1))),0)::int as week_minutes,
           count(*) filter (where total_work_minutes > 0)::int as days_worked,
           count(*) filter (where work_date >= (current_date - ((extract(isodow from current_date)::int) - 1)) and total_work_minutes > 0)::int as week_days_worked,
           max(work_date) as last_work_date
         from public.team_time_entries where team_member_id=$1`,
        [id],
      ),
      glashQuery<Record<string, unknown>>(
        `select work_date, work_mode, attendance_status, current_status, clock_in_at, clock_out_at,
                total_work_minutes, overtime_minutes, early_logout, flags, clock_in_inside_geofence,
                clock_out_inside_geofence, notes
           from public.team_time_entries where team_member_id=$1
          order by work_date desc limit 90`,
        [id],
      ),
      glashQuery<Record<string, unknown>>(
        `select id, device_type, device_name, browser_name, os_name, ip_address, city, region, country,
                country_code, latitude, longitude, timezone, login_source, created_at, last_seen_at,
                expires_at, revoked_at, revoke_reason,
                (revoked_at is null and expires_at > now()) as active
           from public.team_device_sessions where team_member_id=$1
          order by created_at desc limit 100`,
        [id],
      ),
      glashQuery<Record<string, unknown>>(
        `select t.id, t.name, t.kind, t.department, t.project_id, p.role, p.joined_at
           from public.team_chat_participants p
           join public.team_chat_threads t on t.id=p.thread_id
          where p.team_member_id=$1 and t.archived_at is null
          order by lower(coalesce(t.name,t.department,t.kind)), p.joined_at`,
        [id],
      ),
      glashQuery<Record<string, unknown>>(
        `select id, leave_type, start_date, end_date, reason, status, reviewed_by, reviewed_at, review_note, created_at
           from public.team_leave_requests where team_member_id=$1
          order by start_date desc, created_at desc limit 100`,
        [id],
      ),
      glashMaybeOne<Record<string, unknown>>(
        `select * from public.finance_employees
          where team_member_id=$1
             or (team_member_id is null and lower(btrim(email))=lower(btrim($2)))
          order by (team_member_id=$1) desc, created_at desc limit 1`,
        [id, member.email],
      ),
      glashMaybeOne<Record<string, unknown>>(
        `select status, enrolled_at, last_verified_at, latest_capture_at, latest_match_score,
                latest_liveness_score, latest_verification_flag, verification_failures, reset_requested_at
           from public.team_face_profiles where team_member_id=$1`,
        [id],
      ),
      glashQuery<Record<string, unknown>>(
        `select e.id, e.asset_tag, e.name, e.serial_number, e.manufacturer, e.model,
                e.condition, e.status, e.assigned_at, t.name as equipment_type
           from public.admin_equipment e
           join public.admin_equipment_types t on t.id=e.equipment_type_id
          where e.assigned_team_member_id=$1 and e.deleted_at is null
          order by e.assigned_at desc, e.name`,
        [id],
      ),
    ]);

    const financialAllowed = canSeeFinancial(session);
    const hrAllowed = canSeeHrRecords(session);
    const employeeId = financialAllowed ? String(payrollProfile?.id || "") : "";
    const [payrollHistory, rawRecords] = await Promise.all([
      employeeId
        ? glashQuery<Record<string, unknown>>(
            `select i.id, i.amount, i.account_number, i.bank_code, i.narration,
                    r.id as payroll_run_id, r.title, r.period, r.status, r.currency, r.created_at
               from public.finance_payroll_items i
               join public.finance_payroll_runs r on r.id=i.payroll_run_id
              where i.employee_id=$1
              order by r.period desc, r.created_at desc`,
            [employeeId],
          )
        : Promise.resolve([]),
      hrAllowed
        ? glashQuery<Record<string, unknown>>(
            `select id, record_number, record_type, title, summary, status, event_date, effective_date,
                    due_at, signed_at, acknowledged_at, resolved_at, is_confidential,
                    file_name, mime_type, size_bytes, created_by, created_at, updated_at,
                    case when storage_path is not null then '/api/admin/hr/compliance/file/' || id else null end as file_url
               from public.hr_personnel_records where team_member_id=$1
              order by event_date desc, created_at desc limit 250`,
            [id],
          )
        : Promise.resolve([]),
    ]);

    const records = rawRecords.filter((record) => financialAllowed || record.record_type !== "bank_statement");
    const paidTotal = payrollHistory.reduce((total, item) => (
      item.status === "paid" ? total + Number(item.amount || 0) : total
    ), 0);
    const sessionDevices = new Set(sessions.map((row) => [row.device_name, row.browser_name, row.os_name].filter(Boolean).join("|")));
    const birthday = birthdayDistance(String(member.date_of_birth || "") || null);
    const safeMember = { ...member };
    if (!financialAllowed) {
      for (const key of ["bank_name", "bank_code", "account_number", "account_name", "base_salary", "salary_currency", "pay_cycle"]) {
        delete safeMember[key];
      }
    }

    return NextResponse.json({
      ok: true,
      capabilities: { financial: financialAllowed, hr_records: hrAllowed },
      member: safeMember,
      birthday,
      work_summary: workSummary || { total_minutes: 0, week_minutes: 0, days_worked: 0, week_days_worked: 0 },
      attendance,
      login_sessions: sessions,
      access_summary: { login_count: sessions.length, unique_devices: sessionDevices.size, active_sessions: sessions.filter((row) => row.active).length },
      groups,
      leave,
      face_profile: faceProfile,
      equipment,
      financial: financialAllowed ? { profile: payrollProfile, payroll_history: payrollHistory, total_paid: paidTotal } : null,
      hr_records: records,
      queries: records.filter((record) => record.record_type === "query" || record.record_type === "query_response"),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load the team member record." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!assertTrustedMutationOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Untrusted request origin." }, { status: 403 });
  }
  const { session, denied } = await requireAdmin(req, "team_members.edit");
  if (denied || !session) return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: rawId } = await params;
  const id = hrUuid(rawId);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid team member." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const dateOfBirth = body.date_of_birth === null || body.date_of_birth === "" ? null : hrDateOnly(body.date_of_birth);
  if (body.date_of_birth && !dateOfBirth) {
    return NextResponse.json({ ok: false, error: "Enter a valid birthday." }, { status: 400 });
  }
  const reminderDays = Number(body.birthday_reminder_days ?? 14);
  if (!Number.isInteger(reminderDays) || reminderDays < 1 || reminderDays > 90) {
    return NextResponse.json({ ok: false, error: "Birthday reminders must be between 1 and 90 days." }, { status: 400 });
  }
  const row = await glashMaybeOne<{ id: string; full_name: string }>(
    `update public.team_members
        set date_of_birth=$2,
            birthday_reminder_enabled=$3,
            birthday_reminder_days=$4,
            updated_at=now()
      where id=$1 returning id, full_name`,
    [id, dateOfBirth, body.birthday_reminder_enabled !== false, reminderDays],
  );
  if (!row) return NextResponse.json({ ok: false, error: "Team member not found." }, { status: 404 });
  await logActivity({
    action: "team_member.update_birthday_reminder",
    page: "team-members",
    resource_type: "team_member",
    resource_id: id,
    resource_label: row.full_name,
    metadata: { date_of_birth: dateOfBirth, birthday_reminder_enabled: body.birthday_reminder_enabled !== false, birthday_reminder_days: reminderDays },
  });
  return NextResponse.json({ ok: true });
}
