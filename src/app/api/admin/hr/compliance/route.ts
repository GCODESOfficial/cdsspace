import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { birthdayDistance, HR_RECORD_STATUSES, hrDateOnly, hrText, hrUuid, isHrRecordStatus, isHrRecordType } from "@/lib/hr-personnel";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE_REQUIRED_TYPES = new Set(["employment_contract", "ip_protection", "nda", "bank_statement"]);

type ComplianceMemberRow = {
  id: string;
  full_name: string;
  email: string;
  role_title: string | null;
  department: string | null;
  is_active: boolean;
  date_of_birth: string | null;
  birthday_reminder_enabled: boolean;
  birthday_reminder_days: number;
  birthday_last_celebrated_year: number | null;
  birthday_last_celebrated_at: string | null;
};

function actorFor(session: { name?: string; email?: string } | null) {
  return session?.name || session?.email || "Administrator";
}

function actorKey(session: { memberId?: string; email?: string } | null) {
  return session?.memberId || String(session?.email || "administrator").trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "hr_compliance.view");
  if (denied || !session) return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [records, members, draft] = await Promise.all([
      glashQuery<Record<string, unknown>>(
        `select r.id, r.record_number, r.team_member_id, r.record_type, r.title, r.summary, r.status,
                r.event_date, r.effective_date, r.due_at, r.signed_at, r.acknowledged_at,
                r.resolved_at, r.is_confidential, r.file_name, r.mime_type, r.size_bytes,
                r.created_by, r.updated_by, r.created_at, r.updated_at,
                m.full_name, m.email, m.role_title, m.department,
                case when r.storage_path is not null then '/api/admin/hr/compliance/file/' || r.id else null end as file_url
           from public.hr_personnel_records r
           join public.team_members m on m.id=r.team_member_id
          order by case when r.status in ('issued','draft') then 0 else 1 end,
                   r.event_date desc, r.created_at desc
          limit 1500`,
      ),
      glashQuery<ComplianceMemberRow>(
        `select id, full_name, email, role_title, department, is_active, date_of_birth,
                birthday_reminder_enabled, birthday_reminder_days,
                birthday_last_celebrated_year, birthday_last_celebrated_at
           from public.team_members
          order by is_active desc, full_name asc`,
      ),
      glashMaybeOne<{ payload: Record<string, unknown>; updated_at: string }>(
        `select payload, updated_at from public.hr_personnel_record_drafts where actor_key=$1`,
        [actorKey(session)],
      ),
    ]);
    const canSeeFinancial = session.role === "super_admin" || hasPermission(session.permissions || [], "hr_compliance.financial");
    const visibleRecords = records.filter((record) => canSeeFinancial || record.record_type !== "bank_statement");
    const birthdays = members
      .map((member) => ({ ...member, birthday: birthdayDistance(String(member.date_of_birth || "") || null) }))
      .filter((member) => member.birthday && member.birthday_reminder_enabled !== false)
      .sort((a, b) => Number(a.birthday?.daysUntil || 999) - Number(b.birthday?.daysUntil || 999));
    const stats = {
      total: visibleRecords.filter((record) => record.status !== "archived").length,
      signed: visibleRecords.filter((record) => Boolean(record.signed_at) && record.status !== "archived").length,
      open_queries: visibleRecords.filter((record) => record.record_type === "query" && !["resolved", "archived"].includes(String(record.status))).length,
      due_birthdays: birthdays.filter((member) => Number(member.birthday?.daysUntil || 999) <= Number(member.birthday_reminder_days || 14)).length,
    };
    return NextResponse.json({ ok: true, records: visibleRecords, members, birthdays, stats, draft, capabilities: { financial: canSeeFinancial } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load HR compliance." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ ok: false, error: "Untrusted request origin." }, { status: 403 });
  const { session, denied } = await requireAdmin(req, "hr_compliance.manage");
  if (denied || !session) return denied ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = hrText(body.action, 60);
  const actor = actorFor(session);

  if (action === "save_draft") {
    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? JSON.stringify(body.payload)
      : "{}";
    if (payload.length > 50000) return NextResponse.json({ ok: false, error: "The draft is too large." }, { status: 413 });
    await glashQuery(
      `insert into public.hr_personnel_record_drafts (actor_key,payload,updated_at)
       values ($1,$2::jsonb,now())
       on conflict (actor_key) do update set payload=excluded.payload, updated_at=now()`,
      [actorKey(session), payload],
    );
    return NextResponse.json({ ok: true, saved_at: new Date().toISOString() });
  }

  if (action === "discard_draft") {
    await glashQuery(`delete from public.hr_personnel_record_drafts where actor_key=$1`, [actorKey(session)]);
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_birthday_celebrated") {
    const memberId = hrUuid(body.team_member_id);
    const year = Number(body.year);
    if (!memberId || !Number.isInteger(year) || year < 2000 || year > 2200) {
      return NextResponse.json({ ok: false, error: "Invalid birthday reminder." }, { status: 400 });
    }
    const member = await glashMaybeOne<{ full_name: string }>(
      `update public.team_members
          set birthday_last_celebrated_year=$2, birthday_last_celebrated_at=now(), updated_at=now()
        where id=$1 returning full_name`,
      [memberId, year],
    );
    if (!member) return NextResponse.json({ ok: false, error: "Team member not found." }, { status: 404 });
    await logActivity({ action: "hr.birthday_celebrated", page: "hr-compliance", resource_type: "team_member", resource_id: memberId, resource_label: member.full_name, metadata: { year } });
    return NextResponse.json({ ok: true });
  }

  if (action === "update_status") {
    const recordId = hrUuid(body.id);
    if (!recordId || !isHrRecordStatus(body.status)) {
      return NextResponse.json({ ok: false, error: "Choose a valid record and status." }, { status: 400 });
    }
    const current = await glashMaybeOne<Record<string, unknown>>(
      `select id, title, status from public.hr_personnel_records where id=$1`,
      [recordId],
    );
    if (!current) return NextResponse.json({ ok: false, error: "HR record not found." }, { status: 404 });
    const nextStatus = body.status;
    await glashQuery(
      `with updated as (
         update public.hr_personnel_records
            set status=$2, updated_by=$3,
                acknowledged_at=case when $2='acknowledged' then coalesce(acknowledged_at,now()) else acknowledged_at end,
                resolved_at=case when $2='resolved' then coalesce(resolved_at,now()) else resolved_at end
          where id=$1 returning id
       )
       insert into public.hr_personnel_record_events (record_id, action, from_status, to_status, note, actor)
       select id,
              case when $2='archived' then 'archived' when $2='resolved' then 'resolved' when $2='acknowledged' then 'acknowledged' else 'updated' end,
              $4, $2, $5, $3 from updated`,
      [recordId, nextStatus, actor, current.status, hrText(body.note, 2000)],
    );
    await logActivity({ action: `hr.record.${nextStatus}`, page: "hr-compliance", resource_type: "hr_personnel_record", resource_id: recordId, resource_label: String(current.title || recordId) });
    return NextResponse.json({ ok: true });
  }

  if (action !== "create_record") {
    return NextResponse.json({ ok: false, error: "Unsupported HR action." }, { status: 400 });
  }
  const teamMemberId = hrUuid(body.team_member_id);
  const title = hrText(body.title, 220);
  const summary = hrText(body.summary, 10000);
  const eventDate = hrDateOnly(body.event_date) || new Date().toISOString().slice(0, 10);
  const effectiveDate = body.effective_date ? hrDateOnly(body.effective_date) : null;
  if (!teamMemberId || !title || !isHrRecordType(body.record_type)) {
    return NextResponse.json({ ok: false, error: "Choose a team member, record type, and title." }, { status: 400 });
  }
  if (FILE_REQUIRED_TYPES.has(body.record_type)) {
    return NextResponse.json({ ok: false, error: "This record type requires a document upload." }, { status: 400 });
  }
  const status = isHrRecordStatus(body.status) ? body.status : "issued";
  const member = await glashMaybeOne<{ full_name: string }>("select full_name from public.team_members where id=$1", [teamMemberId]);
  if (!member) return NextResponse.json({ ok: false, error: "Team member not found." }, { status: 404 });
  const row = await glashMaybeOne<Record<string, unknown>>(
    `with inserted as (
       insert into public.hr_personnel_records
         (team_member_id, record_type, title, summary, status, event_date, effective_date, due_at, signed_at, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) returning *
     ), event as (
       insert into public.hr_personnel_record_events (record_id, action, to_status, actor)
       select id, 'created', status, $10 from inserted
     ) select * from inserted`,
    [
      teamMemberId, body.record_type, title, summary, status, eventDate, effectiveDate,
      body.due_at ? new Date(String(body.due_at)).toISOString() : null,
      body.signed_at ? new Date(String(body.signed_at)).toISOString() : null,
      actor,
    ],
  );
  await glashQuery(`delete from public.hr_personnel_record_drafts where actor_key=$1`, [actorKey(session)]);
  await logActivity({ action: "hr.record.create", page: "hr-compliance", resource_type: "hr_personnel_record", resource_id: String(row?.id || ""), resource_label: `${member.full_name}: ${title}`, metadata: { record_type: body.record_type } });
  return NextResponse.json({ ok: true, record: row });
}
