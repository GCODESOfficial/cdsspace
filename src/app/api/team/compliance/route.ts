/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getTeamSession } from "@/lib/team-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { insertActivityLog } from "@/lib/activity-log";
import {
  OVERNIGHT_TERMS_VERSION,
  SOP_SCOPE_TYPES,
  complianceDate,
  complianceText,
  complianceTime,
  complianceUuid,
  overnightTermsText,
  uniqueStrings,
  uniqueUuids,
} from "@/lib/team-compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadWorkspace(
  member: NonNullable<Awaited<ReturnType<typeof getTeamSession>>>,
) {
  await glashQuery(
    `update public.team_compliance_library_loans
        set status='overdue'
      where status='borrowed' and due_at < now()`,
  );
  const [sops, books, loans, overnightRequests] = await Promise.all([
    glashQuery<any>(
      `select s.*,
        exists(select 1 from public.team_compliance_sop_collaborators c where c.sop_id=s.id and c.team_member_id=$1) as is_invited,
        exists(select 1 from public.team_compliance_sop_collaborators c where c.sop_id=s.id and c.team_member_id=$1 and c.can_edit) as can_edit,
        exists(select 1 from public.team_compliance_sop_collaborators c where c.sop_id=s.id and c.team_member_id=$1 and c.can_publish) as can_publish,
        exists(select 1 from public.team_compliance_sop_acknowledgements ack where ack.sop_id=s.id and ack.team_member_id=$1) as acknowledged,
        exists(
          select 1 from public.team_compliance_sop_assignments assigned
          where assigned.sop_id=s.id and (
            assigned.audience_type='all'
            or (assigned.audience_type='member' and assigned.team_member_id=$1)
            or (assigned.audience_type='department' and lower(assigned.department)=lower(coalesce($2,'')))
          )
        ) as is_assigned,
        coalesce((select jsonb_agg(jsonb_build_object(
          'id', a.id, 'audience_type', a.audience_type, 'department', a.department,
          'team_member_id', a.team_member_id, 'member_name', tm.full_name
        ) order by a.created_at)
        from public.team_compliance_sop_assignments a
        left join public.team_members tm on tm.id=a.team_member_id
        where a.sop_id=s.id), '[]'::jsonb) as assignments,
        coalesce((select jsonb_agg(jsonb_build_object(
          'id', media.id, 'file_name', media.file_name, 'mime_type', media.mime_type,
          'size_bytes', media.size_bytes, 'media_type', media.media_type,
          'url', '/api/team/compliance/media/' || media.id
        ) order by media.created_at)
        from public.team_compliance_sop_media media where media.sop_id=s.id), '[]'::jsonb) as media
      from public.team_compliance_sops s
      where (
        s.status='published' and exists(
          select 1 from public.team_compliance_sop_assignments assigned
          where assigned.sop_id=s.id and (
            assigned.audience_type='all'
            or (assigned.audience_type='member' and assigned.team_member_id=$1)
            or (assigned.audience_type='department' and lower(assigned.department)=lower(coalesce($2,'')))
          )
        )
      ) or exists(
        select 1 from public.team_compliance_sop_collaborators c
        where c.sop_id=s.id and c.team_member_id=$1
      )
      order by case s.status when 'draft' then 0 when 'published' then 1 else 2 end,
               case s.scope_type when 'general' then 0 when 'task' then 1 else 2 end,
               lower(coalesce(s.department,'')), s.sop_number, s.updated_at desc`,
      [member.id, member.department || ""],
    ),
    glashQuery<any>(
      `select b.id,b.inventory_number,b.title,b.author,b.isbn,b.category,b.description,
              b.acquisition_type,b.donor_name,b.book_condition,b.status,
              l.member_name as borrowed_by,l.due_at
         from public.team_compliance_library_books b
         left join public.team_compliance_library_loans l
           on l.book_id=b.id and l.status in ('borrowed','overdue')
        where b.status in ('available','borrowed','maintenance')
        order by b.title asc`,
    ),
    glashQuery<any>(
      `select l.*,b.title as book_title,b.author as book_author,b.inventory_number
         from public.team_compliance_library_loans l
         join public.team_compliance_library_books b on b.id=l.book_id
        where l.team_member_id=$1
        order by l.created_at desc`,
      [member.id],
    ),
    glashQuery<any>(
      `select * from public.team_compliance_overnight_requests
        where team_member_id=$1
        order by created_at desc`,
      [member.id],
    ),
  ]);

  const canAuthor = sops.some((sop) => sop.can_edit);
  const members = canAuthor
    ? await glashQuery<any>(
        `select id,full_name,department,role_title from public.team_members where is_active=true order by full_name asc`,
      )
    : [];
  const departments = Array.from(
    new Set(
      members
        .map((item) => complianceText(item.department, 160))
        .filter(Boolean),
    ),
  ).sort();
  return {
    sops,
    books,
    loans,
    overnightRequests,
    members,
    departments,
    terms: overnightTermsText(),
    termsVersion: OVERNIGHT_TERMS_VERSION,
  };
}

async function teamActivity(
  member: NonNullable<Awaited<ReturnType<typeof getTeamSession>>>,
  input: {
    action: string;
    resource_type: string;
    resource_id?: string | null;
    resource_label?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await insertActivityLog({
    ...input,
    page: "team/compliance",
    actor_kind: "team",
    actor_id: member.id,
    actor_name: member.full_name || member.email,
    actor_is_admin: false,
  }).catch(() => undefined);
}

export async function GET() {
  const member = await getTeamSession();
  if (!member)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  try {
    return NextResponse.json({
      ok: true,
      member: {
        id: member.id,
        full_name: member.full_name,
        department: member.department,
      },
      ...(await loadWorkspace(member)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load Team compliance.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!assertTrustedMutationOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Untrusted request origin." },
      { status: 403 },
    );
  }
  const member = await getTeamSession();
  if (!member)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = complianceText(body.action, 80);

  try {
    if (action === "acknowledge_sop") {
      const id = complianceUuid(body.id);
      const visible = id
        ? await glashMaybeOne<any>(
            `select s.id,s.title from public.team_compliance_sops s
          where s.id=$1 and s.status='published' and exists(
            select 1 from public.team_compliance_sop_assignments a where a.sop_id=s.id and (
              a.audience_type='all' or (a.audience_type='member' and a.team_member_id=$2)
              or (a.audience_type='department' and lower(a.department)=lower(coalesce($3,'')))
            )
          )`,
            [id, member.id, member.department || ""],
          )
        : null;
      if (!visible)
        return NextResponse.json(
          { ok: false, error: "SOP not found." },
          { status: 404 },
        );
      await glashQuery(
        `insert into public.team_compliance_sop_acknowledgements (sop_id,team_member_id)
         values ($1,$2) on conflict (sop_id,team_member_id) do update set acknowledged_at=now()`,
        [id, member.id],
      );
      await teamActivity(member, {
        action: "team_compliance.sop.acknowledge",
        resource_type: "team_compliance_sop",
        resource_id: id,
        resource_label: visible.title,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "save_sop") {
      const id = complianceUuid(body.id);
      const access = id
        ? await glashMaybeOne<any>(
            `select s.status,c.can_edit,c.can_publish
           from public.team_compliance_sops s
           join public.team_compliance_sop_collaborators c on c.sop_id=s.id
          where s.id=$1 and c.team_member_id=$2`,
            [id, member.id],
          )
        : null;
      if (!access?.can_edit)
        return NextResponse.json(
          { ok: false, error: "You were not invited to edit this SOP." },
          { status: 403 },
        );
      const scopeType = (SOP_SCOPE_TYPES as readonly string[]).includes(
        complianceText(body.scope_type, 30),
      )
        ? complianceText(body.scope_type, 30)
        : "general";
      const title = complianceText(body.title, 220);
      const content = complianceText(body.content, 40000);
      const requestedStatus =
        body.status === "published" ? "published" : "draft";
      if (requestedStatus === "published" && !access.can_publish) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "You can draft this SOP, but only an invited publisher can publish it.",
          },
          { status: 403 },
        );
      }
      const department =
        scopeType === "department"
          ? complianceText(body.department, 160) || null
          : null;
      const taskName =
        scopeType === "task"
          ? complianceText(body.task_name, 220) || null
          : null;
      if (
        requestedStatus === "published" &&
        (!title ||
          !content ||
          (scopeType === "department" && !department) ||
          (scopeType === "task" && !taskName))
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Complete the title, procedure, and selected scope before publishing.",
          },
          { status: 400 },
        );
      }
      const row = await glashMaybeOne<any>(
        `update public.team_compliance_sops
            set title=$1,summary=$2,content=$3,scope_type=$4,department=$5,task_name=$6,status=$7,
                updated_by=$8, version=case when $7='published' and status<>'published' then version+1 else version end,
                published_at=case when $7='published' then coalesce(published_at,now()) else published_at end
          where id=$9 returning *`,
        [
          title,
          complianceText(body.summary, 1500),
          content,
          scopeType,
          department,
          taskName,
          requestedStatus,
          member.full_name,
          id,
        ],
      );

      const allTeam = body.all_team === true;
      const departments = uniqueStrings(body.assignment_departments, 100);
      const memberIds = uniqueUuids(body.assignment_member_ids);
      await glashQuery(
        `delete from public.team_compliance_sop_assignments where sop_id=$1`,
        [id],
      );
      if (
        allTeam ||
        (requestedStatus === "published" &&
          !departments.length &&
          !memberIds.length)
      ) {
        await glashQuery(
          `insert into public.team_compliance_sop_assignments (sop_id,audience_type,assigned_by)
           values ($1,'all',$2) on conflict do nothing`,
          [id, member.full_name],
        );
      } else {
        for (const value of departments) {
          await glashQuery(
            `insert into public.team_compliance_sop_assignments (sop_id,audience_type,department,assigned_by)
             values ($1,'department',$2,$3) on conflict do nothing`,
            [id, value, member.full_name],
          );
        }
        for (const memberId of memberIds) {
          await glashQuery(
            `insert into public.team_compliance_sop_assignments (sop_id,audience_type,team_member_id,assigned_by)
             select $1,'member',id,$3 from public.team_members where id=$2 and is_active=true on conflict do nothing`,
            [id, memberId, member.full_name],
          );
        }
      }
      if (requestedStatus === "published" && body.autosave !== true) {
        await teamActivity(member, {
          action: "team_compliance.sop.publish",
          resource_type: "team_compliance_sop",
          resource_id: id,
          resource_label: title,
        });
      }
      return NextResponse.json({ ok: true, sop: row });
    }

    if (action === "delete_media") {
      const id = complianceUuid(body.id);
      const media = id
        ? await glashMaybeOne<any>(
            `delete from public.team_compliance_sop_media media
          using public.team_compliance_sop_collaborators c
          where media.id=$1 and c.sop_id=media.sop_id and c.team_member_id=$2 and c.can_edit
          returning media.storage_path`,
            [id, member.id],
          )
        : null;
      if (!media)
        return NextResponse.json(
          { ok: false, error: "Attachment not found." },
          { status: 404 },
        );
      const { getGlashDbAdmin } = await import("@/lib/glashdb");
      await (getGlashDbAdmin() as any).storage
        .from("team-compliance")
        .remove([media.storage_path])
        .catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    if (action === "create_loan_draft") {
      const bookId = complianceUuid(body.book_id);
      const book = bookId
        ? await glashMaybeOne<any>(
            `select id,status from public.team_compliance_library_books where id=$1`,
            [bookId],
          )
        : null;
      if (!book || book.status !== "available")
        return NextResponse.json(
          { ok: false, error: "This book is not currently available." },
          { status: 409 },
        );
      const existing = await glashMaybeOne<any>(
        `select * from public.team_compliance_library_loans
          where book_id=$1 and team_member_id=$2 and status in ('draft','requested')
          order by created_at desc limit 1`,
        [bookId, member.id],
      );
      if (existing) return NextResponse.json({ ok: true, loan: existing });
      const row = await glashMaybeOne<any>(
        `insert into public.team_compliance_library_loans
          (book_id,team_member_id,member_name,member_email)
         values ($1,$2,$3,$4) returning *`,
        [bookId, member.id, member.full_name, member.email],
      );
      return NextResponse.json({ ok: true, loan: row });
    }

    if (action === "save_loan") {
      const id = complianceUuid(body.id);
      const requestedDays = Math.max(
        1,
        Math.min(21, Math.floor(Number(body.requested_days) || 21)),
      );
      const submit = body.submit === true;
      const row = id
        ? await glashMaybeOne<any>(
            `update public.team_compliance_library_loans l
            set requested_days=$1,request_note=$2,status=case when $3 then 'requested' else 'draft' end,
                requested_at=case when $3 then now() else requested_at end
          where l.id=$4 and l.team_member_id=$5 and l.status='draft'
            and exists(select 1 from public.team_compliance_library_books b where b.id=l.book_id and b.status='available')
          returning *`,
            [
              requestedDays,
              complianceText(body.request_note, 2000),
              submit,
              id,
              member.id,
            ],
          )
        : null;
      if (!row)
        return NextResponse.json(
          {
            ok: false,
            error:
              "The loan draft could not be saved because the book is no longer available.",
          },
          { status: 409 },
        );
      if (submit)
        await teamActivity(member, {
          action: "team_compliance.loan.request",
          resource_type: "library_loan",
          resource_id: id,
          resource_label: row.member_name,
          metadata: { requested_days: requestedDays },
        });
      return NextResponse.json({ ok: true, loan: row });
    }

    if (action === "cancel_loan") {
      const id = complianceUuid(body.id);
      const row = id
        ? await glashMaybeOne<any>(
            `update public.team_compliance_library_loans set status='cancelled'
          where id=$1 and team_member_id=$2 and status in ('draft','requested') returning id`,
            [id, member.id],
          )
        : null;
      if (!row)
        return NextResponse.json(
          { ok: false, error: "The loan request can no longer be cancelled." },
          { status: 409 },
        );
      return NextResponse.json({ ok: true });
    }

    if (action === "create_overnight_draft") {
      const row = await glashMaybeOne<any>(
        `insert into public.team_compliance_overnight_requests
          (team_member_id,member_name,member_email,terms_version,terms_text_snapshot)
         values ($1,$2,$3,$4,$5)
         on conflict (team_member_id) where status='draft'
         do update set
           member_name=excluded.member_name,
           member_email=excluded.member_email
         returning *`,
        [
          member.id,
          member.full_name,
          member.email,
          OVERNIGHT_TERMS_VERSION,
          overnightTermsText(),
        ],
      );
      return NextResponse.json({ ok: true, request: row });
    }

    if (action === "save_overnight") {
      const id = complianceUuid(body.id);
      const submit = body.submit === true;
      const requestedDate = complianceDate(body.requested_date);
      const plannedStart = complianceTime(body.planned_start);
      const plannedEnd = complianceTime(body.planned_end);
      const purpose = complianceText(body.purpose, 4000);
      const emergencyContact = complianceText(body.emergency_contact, 240);
      const signatureName = complianceText(body.signature_name, 220);
      if (
        submit &&
        (!requestedDate ||
          !plannedStart ||
          !plannedEnd ||
          !purpose ||
          !emergencyContact)
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Complete the date, times, purpose, and emergency contact before submitting.",
          },
          { status: 400 },
        );
      }
      if (
        submit &&
        (body.terms_accepted !== true ||
          signatureName.toLocaleLowerCase() !==
            member.full_name.trim().toLocaleLowerCase())
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "Accept the terms and sign with your full account name.",
          },
          { status: 400 },
        );
      }
      const row = id
        ? await glashMaybeOne<any>(
            `update public.team_compliance_overnight_requests
            set requested_date=$1,planned_start=$2,planned_end=$3,purpose=$4,emergency_contact=$5,
                signature_name=$6,terms_version=$7,terms_text_snapshot=$8,
                signed_at=case when $9 then now() else signed_at end,
                status=case when $9 then 'pending' else 'draft' end
          where id=$10 and team_member_id=$11 and status='draft'
            and ($1::date is null or $1::date >= current_date)
          returning *`,
            [
              requestedDate,
              plannedStart,
              plannedEnd,
              purpose,
              emergencyContact,
              signatureName,
              OVERNIGHT_TERMS_VERSION,
              overnightTermsText(),
              submit,
              id,
              member.id,
            ],
          )
        : null;
      if (!row)
        return NextResponse.json(
          {
            ok: false,
            error:
              "Choose today or a future date. This draft may already have been submitted.",
          },
          { status: 409 },
        );
      if (submit)
        await teamActivity(member, {
          action: "team_compliance.overnight.request",
          resource_type: "overnight_request",
          resource_id: id,
          resource_label: member.full_name,
          metadata: { requested_date: requestedDate },
        });
      return NextResponse.json({ ok: true, request: row });
    }

    if (action === "cancel_overnight") {
      const id = complianceUuid(body.id);
      const row = id
        ? await glashMaybeOne<any>(
            `update public.team_compliance_overnight_requests set status='cancelled'
          where id=$1 and team_member_id=$2 and status in ('draft','pending') returning id`,
            [id, member.id],
          )
        : null;
      if (!row)
        return NextResponse.json(
          {
            ok: false,
            error: "The overnight request can no longer be cancelled.",
          },
          { status: 409 },
        );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown Team compliance action." },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Team compliance could not be updated.";
    const friendly = message.includes(
      "team_compliance_overnight_member_date_uq",
    )
      ? "You already have a pending or approved overnight request for that date."
      : message;
    return NextResponse.json({ ok: false, error: friendly }, { status: 500 });
  }
}
