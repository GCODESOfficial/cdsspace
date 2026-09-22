/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/admin-permissions";
import {
  BOOK_CONDITIONS,
  BOOK_STATUSES,
  SOP_SCOPE_TYPES,
  SOP_STATUSES,
  complianceText,
  complianceUuid,
  uniqueStrings,
  uniqueUuids,
} from "@/lib/team-compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pick<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  const candidate = complianceText(value, 40);
  return (allowed as readonly string[]).includes(candidate)
    ? (candidate as T[number])
    : fallback;
}

function actorFor(session: any) {
  return session?.name || session?.email || "Administrator";
}

async function loadWorkspace() {
  await glashQuery(
    `update public.team_compliance_library_loans
        set status='overdue'
      where status='borrowed' and due_at < now()`,
  );

  const [sops, books, loans, overnightRequests, members] = await Promise.all([
    glashQuery<any>(
      `select s.*,
        coalesce((select jsonb_agg(jsonb_build_object(
          'team_member_id', c.team_member_id,
          'full_name', m.full_name,
          'department', m.department,
          'can_edit', c.can_edit,
          'can_publish', c.can_publish
        ) order by m.full_name)
        from public.team_compliance_sop_collaborators c
        join public.team_members m on m.id=c.team_member_id
        where c.sop_id=s.id), '[]'::jsonb) as collaborators,
        coalesce((select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'audience_type', a.audience_type,
          'department', a.department,
          'team_member_id', a.team_member_id,
          'member_name', tm.full_name
        ) order by a.created_at)
        from public.team_compliance_sop_assignments a
        left join public.team_members tm on tm.id=a.team_member_id
        where a.sop_id=s.id), '[]'::jsonb) as assignments,
        coalesce((select jsonb_agg(jsonb_build_object(
          'id', media.id,
          'file_name', media.file_name,
          'mime_type', media.mime_type,
          'size_bytes', media.size_bytes,
          'media_type', media.media_type,
          'url', '/api/team/compliance/media/' || media.id
        ) order by media.created_at)
        from public.team_compliance_sop_media media
        where media.sop_id=s.id), '[]'::jsonb) as media,
        (select count(*)::int from public.team_compliance_sop_acknowledgements ack where ack.sop_id=s.id) as acknowledgement_count
      from public.team_compliance_sops s
      order by case s.status when 'draft' then 0 when 'published' then 1 else 2 end,
               case s.scope_type when 'general' then 0 when 'task' then 1 else 2 end,
               lower(coalesce(s.department,'')), s.sop_number, s.updated_at desc
      limit 500`,
    ),
    glashQuery<any>(
      `select b.*,
        l.id as active_loan_id, l.member_name as borrowed_by, l.due_at,
        (select count(*)::int from public.team_compliance_library_loans history where history.book_id=b.id) as loan_count
      from public.team_compliance_library_books b
      left join public.team_compliance_library_loans l
        on l.book_id=b.id and l.status in ('borrowed','overdue')
      order by case b.status when 'draft' then 0 when 'available' then 1 else 2 end, b.title asc
      limit 1000`,
    ),
    glashQuery<any>(
      `select l.*, b.title as book_title, b.inventory_number
      from public.team_compliance_library_loans l
      join public.team_compliance_library_books b on b.id=l.book_id
      where l.status <> 'draft'
      order by case l.status when 'requested' then 0 when 'overdue' then 1 when 'borrowed' then 2 else 3 end,
               l.created_at desc
      limit 1000`,
    ),
    glashQuery<any>(
      `select * from public.team_compliance_overnight_requests
       where status <> 'draft'
       order by case status when 'pending' then 0 when 'approved' then 1 else 2 end,
                requested_date desc nulls last, created_at desc
       limit 1000`,
    ),
    glashQuery<any>(
      `select id, full_name, email, department, role_title, is_sub_admin
       from public.team_members
       where is_active=true
       order by full_name asc`,
    ),
  ]);

  const departments = Array.from(
    new Set(
      members
        .map((member) => complianceText(member.department, 160))
        .filter(Boolean),
    ),
  ).sort();
  return { sops, books, loans, overnightRequests, members, departments };
}

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "team_compliance");
  if (denied) return denied;
  try {
    const isSuperAdmin = session?.role === "super_admin";
    const permissions = session?.permissions || [];
    const capabilities = {
      overview:
        isSuperAdmin || hasPermission(permissions, "team_compliance.view"),
      sops:
        isSuperAdmin ||
        hasPermission(permissions, "team_compliance.sops.manage"),
      library:
        isSuperAdmin ||
        hasPermission(permissions, "team_compliance.library.manage"),
      approvals:
        isSuperAdmin ||
        hasPermission(permissions, "team_compliance.approvals.manage"),
    };
    const workspace = await loadWorkspace();
    return NextResponse.json({
      ok: true,
      canInviteLeads: isSuperAdmin,
      canDeleteSops: isSuperAdmin,
      capabilities,
      sops: capabilities.overview || capabilities.sops ? workspace.sops : [],
      books:
        capabilities.overview || capabilities.library ? workspace.books : [],
      loans:
        capabilities.overview || capabilities.library ? workspace.loans : [],
      overnightRequests:
        capabilities.overview || capabilities.approvals
          ? workspace.overnightRequests
          : [],
      members:
        capabilities.overview || capabilities.sops || capabilities.library
          ? workspace.members
          : [],
      departments:
        capabilities.overview || capabilities.sops ? workspace.departments : [],
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
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = complianceText(body.action, 80);
  const permission =
    action.includes("sop") || action.includes("media")
      ? "team_compliance.sops.manage"
      : action.includes("book") || action.includes("loan")
        ? "team_compliance.library.manage"
        : "team_compliance.approvals.manage";
  const { session, denied } = await requireAdmin(req, permission);
  if (denied) return denied;
  const actor = actorFor(session);

  try {
    if (action === "create_sop_draft") {
      const row = await glashMaybeOne<any>(
        `insert into public.team_compliance_sops (created_by, updated_by)
         values ($1,$1) returning *`,
        [actor],
      );
      return NextResponse.json({ ok: true, sop: row });
    }

    if (action === "save_sop") {
      const id = complianceUuid(body.id);
      if (!id)
        return NextResponse.json(
          { ok: false, error: "The SOP draft is invalid." },
          { status: 400 },
        );
      const existing = await glashMaybeOne<any>(
        `select * from public.team_compliance_sops where id=$1`,
        [id],
      );
      if (!existing)
        return NextResponse.json(
          { ok: false, error: "SOP not found." },
          { status: 404 },
        );

      const title = complianceText(body.title, 220);
      const summary = complianceText(body.summary, 1500);
      const content = complianceText(body.content, 40000);
      const scopeType = pick(body.scope_type, SOP_SCOPE_TYPES, "general");
      const department =
        scopeType === "department"
          ? complianceText(body.department, 160) || null
          : null;
      const taskName =
        scopeType === "task"
          ? complianceText(body.task_name, 220) || null
          : null;
      const status = pick(
        body.status,
        SOP_STATUSES,
        existing.status || "draft",
      );
      if (status === "published" && (!title || !content)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Add an SOP title and procedure before publishing.",
          },
          { status: 400 },
        );
      }
      if (status === "published" && scopeType === "department" && !department) {
        return NextResponse.json(
          { ok: false, error: "Choose the department covered by this SOP." },
          { status: 400 },
        );
      }
      if (status === "published" && scopeType === "task" && !taskName) {
        return NextResponse.json(
          { ok: false, error: "Name the task covered by this SOP." },
          { status: 400 },
        );
      }

      const row = await glashMaybeOne<any>(
        `update public.team_compliance_sops
            set title=$1, summary=$2, content=$3, scope_type=$4, department=$5, task_name=$6,
                status=$7, updated_by=$8,
                version=case when $7='published' and status <> 'published' then version + 1 else version end,
                published_at=case when $7='published' then coalesce(published_at, now()) else published_at end
          where id=$9 returning *`,
        [
          title,
          summary,
          content,
          scopeType,
          department,
          taskName,
          status,
          actor,
          id,
        ],
      );

      const allTeam = body.all_team === true;
      const assignmentDepartments = uniqueStrings(
        body.assignment_departments,
        100,
      );
      const assignmentMembers = uniqueUuids(body.assignment_member_ids);
      await glashQuery(
        `delete from public.team_compliance_sop_assignments where sop_id=$1`,
        [id],
      );
      if (
        allTeam ||
        (status === "published" &&
          !assignmentDepartments.length &&
          !assignmentMembers.length)
      ) {
        await glashQuery(
          `insert into public.team_compliance_sop_assignments (sop_id,audience_type,assigned_by)
           values ($1,'all',$2) on conflict do nothing`,
          [id, actor],
        );
      } else {
        for (const value of assignmentDepartments) {
          await glashQuery(
            `insert into public.team_compliance_sop_assignments (sop_id,audience_type,department,assigned_by)
             values ($1,'department',$2,$3) on conflict do nothing`,
            [id, value, actor],
          );
        }
        for (const memberId of assignmentMembers) {
          await glashQuery(
            `insert into public.team_compliance_sop_assignments (sop_id,audience_type,team_member_id,assigned_by)
             select $1,'member',id,$3 from public.team_members where id=$2 and is_active=true
             on conflict do nothing`,
            [id, memberId, actor],
          );
        }
      }

      if (
        session?.role === "super_admin" &&
        Array.isArray(body.collaborators)
      ) {
        await glashQuery(
          `delete from public.team_compliance_sop_collaborators where sop_id=$1`,
          [id],
        );
        for (const entry of body.collaborators.slice(0, 100) as any[]) {
          const memberId = complianceUuid(entry?.team_member_id);
          if (!memberId) continue;
          await glashQuery(
            `insert into public.team_compliance_sop_collaborators
              (sop_id,team_member_id,can_edit,can_publish,invited_by)
             select $1,id,$3,$4,$5 from public.team_members where id=$2 and is_active=true
             on conflict (sop_id,team_member_id) do update
               set can_edit=excluded.can_edit, can_publish=excluded.can_publish, invited_by=excluded.invited_by`,
            [
              id,
              memberId,
              entry?.can_edit !== false,
              entry?.can_publish === true,
              actor,
            ],
          );
        }
      }

      if (status !== "draft" && body.autosave !== true) {
        await logActivity({
          action:
            status === "published"
              ? "team_compliance.sop.publish"
              : "team_compliance.sop.archive",
          page: "team-compliance/sops",
          resource_type: "team_compliance_sop",
          resource_id: id,
          resource_label: title,
          metadata: { scope_type: scopeType },
        });
      }
      return NextResponse.json({ ok: true, sop: row });
    }

    if (action === "delete_sop") {
      if (session?.role !== "super_admin") {
        return NextResponse.json(
          { ok: false, error: "Only the super admin can delete an SOP." },
          { status: 403 },
        );
      }
      const id = complianceUuid(body.id);
      const existing = id
        ? await glashMaybeOne<any>(
            `select title from public.team_compliance_sops where id=$1`,
            [id],
          )
        : null;
      if (!existing)
        return NextResponse.json(
          { ok: false, error: "SOP not found." },
          { status: 404 },
        );
      const media = await glashQuery<any>(
        `select storage_path from public.team_compliance_sop_media where sop_id=$1`,
        [id],
      );
      await glashQuery(`delete from public.team_compliance_sops where id=$1`, [
        id,
      ]);
      if (media.length) {
        const { getGlashDbAdmin } = await import("@/lib/glashdb");
        await (getGlashDbAdmin() as any).storage
          .from("team-compliance")
          .remove(media.map((item) => item.storage_path))
          .catch(() => undefined);
      }
      await logActivity({
        action: "team_compliance.sop.delete",
        page: "team-compliance/sops",
        resource_type: "team_compliance_sop",
        resource_id: id,
        resource_label: existing.title,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_media") {
      const id = complianceUuid(body.id);
      const media = id
        ? await glashMaybeOne<any>(
            `delete from public.team_compliance_sop_media where id=$1 returning storage_path,sop_id,file_name`,
            [id],
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

    if (action === "create_book_draft") {
      const row = await glashMaybeOne<any>(
        `insert into public.team_compliance_library_books (created_by,updated_by)
         values ($1,$1) returning *`,
        [actor],
      );
      return NextResponse.json({ ok: true, book: row });
    }

    if (action === "save_book") {
      const id = complianceUuid(body.id);
      if (!id)
        return NextResponse.json(
          { ok: false, error: "The book draft is invalid." },
          { status: 400 },
        );
      const title = complianceText(body.title, 260);
      const author = complianceText(body.author, 220);
      const status = pick(body.status, BOOK_STATUSES, "draft");
      const acquisitionType =
        body.acquisition_type === "donated" ? "donated" : "purchased";
      const donorMemberId =
        acquisitionType === "donated"
          ? complianceUuid(body.donor_member_id) || null
          : null;
      const donorName =
        acquisitionType === "donated"
          ? complianceText(body.donor_name, 220) || null
          : null;
      if (status !== "draft" && (!title || !author)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Add the book title and author before listing it.",
          },
          { status: 400 },
        );
      }
      if (
        status !== "draft" &&
        acquisitionType === "donated" &&
        !donorMemberId &&
        !donorName
      ) {
        return NextResponse.json(
          { ok: false, error: "Record who gifted the donated book." },
          { status: 400 },
        );
      }
      const activeLoan = await glashMaybeOne<any>(
        `select id from public.team_compliance_library_loans where book_id=$1 and status in ('borrowed','overdue') limit 1`,
        [id],
      );
      if (activeLoan && status !== "borrowed") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Mark the active loan returned before changing this book's availability.",
          },
          { status: 409 },
        );
      }
      const row = await glashMaybeOne<any>(
        `update public.team_compliance_library_books
            set title=$1,author=$2,isbn=$3,category=$4,description=$5,acquisition_type=$6,
                donor_member_id=$7,donor_name=$8,book_condition=$9,status=$10,updated_by=$11
          where id=$12 returning *`,
        [
          title,
          author,
          complianceText(body.isbn, 80) || null,
          complianceText(body.category, 140) || null,
          complianceText(body.description, 4000),
          acquisitionType,
          donorMemberId,
          donorName,
          pick(body.book_condition, BOOK_CONDITIONS, "good"),
          status,
          actor,
          id,
        ],
      );
      if (!row)
        return NextResponse.json(
          { ok: false, error: "Book not found." },
          { status: 404 },
        );
      if (status !== "draft" && body.autosave !== true) {
        await logActivity({
          action: "team_compliance.book.save",
          page: "team-compliance/library",
          resource_type: "library_book",
          resource_id: id,
          resource_label: title,
          metadata: { inventory_number: row.inventory_number, status },
        });
      }
      return NextResponse.json({ ok: true, book: row });
    }

    if (action === "delete_book") {
      const id = complianceUuid(body.id);
      const row = id
        ? await glashMaybeOne<any>(
            `delete from public.team_compliance_library_books b
          where b.id=$1 and not exists (select 1 from public.team_compliance_library_loans l where l.book_id=b.id)
          returning title,inventory_number`,
            [id],
          )
        : null;
      if (!row)
        return NextResponse.json(
          {
            ok: false,
            error:
              "Books with loan history cannot be deleted. Mark the book retired instead.",
          },
          { status: 409 },
        );
      await logActivity({
        action: "team_compliance.book.delete",
        page: "team-compliance/library",
        resource_type: "library_book",
        resource_id: id,
        resource_label: row.title,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "review_loan") {
      const id = complianceUuid(body.id);
      const decision = complianceText(body.decision, 20);
      if (!id || !["approve", "reject", "return"].includes(decision)) {
        return NextResponse.json(
          { ok: false, error: "Choose a valid loan decision." },
          { status: 400 },
        );
      }
      let loan: any = null;
      if (decision === "approve") {
        loan = await glashMaybeOne<any>(
          `with accepted as (
             update public.team_compliance_library_loans l
                set status='borrowed', reviewed_by=$2, reviewed_at=now(), borrowed_at=now(),
                    due_at=now() + make_interval(days => requested_days), admin_note=$3
              where l.id=$1 and l.status='requested'
                and not exists (
                  select 1 from public.team_compliance_library_loans other
                  where other.book_id=l.book_id and other.id<>l.id and other.status in ('borrowed','overdue')
                )
              returning l.*
           ), updated_book as (
             update public.team_compliance_library_books b set status='borrowed',updated_by=$2
              where b.id=(select book_id from accepted) returning b.id
           ) select * from accepted`,
          [id, actor, complianceText(body.note, 2000)],
        );
        if (!loan)
          return NextResponse.json(
            {
              ok: false,
              error:
                "The book is no longer available or the request was already reviewed.",
            },
            { status: 409 },
          );
      } else if (decision === "reject") {
        loan = await glashMaybeOne<any>(
          `update public.team_compliance_library_loans
              set status='rejected',reviewed_by=$2,reviewed_at=now(),admin_note=$3
            where id=$1 and status='requested' returning *`,
          [id, actor, complianceText(body.note, 2000)],
        );
      } else {
        loan = await glashMaybeOne<any>(
          `with returned as (
             update public.team_compliance_library_loans
                set status='returned',returned_at=now(),reviewed_by=$2,reviewed_at=now(),admin_note=$3
              where id=$1 and status in ('borrowed','overdue') returning *
           ), updated_book as (
             update public.team_compliance_library_books b set status='available',updated_by=$2
              where b.id=(select book_id from returned) returning b.id
           ) select * from returned`,
          [id, actor, complianceText(body.note, 2000)],
        );
      }
      if (!loan)
        return NextResponse.json(
          { ok: false, error: "The loan could not be updated." },
          { status: 409 },
        );
      await logActivity({
        action: `team_compliance.loan.${decision}`,
        page: "team-compliance/library",
        resource_type: "library_loan",
        resource_id: id,
        resource_label: loan.member_name,
      });
      return NextResponse.json({ ok: true, loan });
    }

    if (action === "review_overnight") {
      const id = complianceUuid(body.id);
      const decision = complianceText(body.decision, 20);
      if (!id || !["approve", "reject"].includes(decision)) {
        return NextResponse.json(
          { ok: false, error: "Choose approve or reject." },
          { status: 400 },
        );
      }
      const row = await glashMaybeOne<any>(
        `update public.team_compliance_overnight_requests
            set status=$2,reviewed_by=$3,reviewed_at=now(),reviewer_note=$4
          where id=$1 and status='pending' returning *`,
        [
          id,
          decision === "approve" ? "approved" : "rejected",
          actor,
          complianceText(body.note, 2000),
        ],
      );
      if (!row)
        return NextResponse.json(
          {
            ok: false,
            error: "The request was already reviewed or no longer exists.",
          },
          { status: 409 },
        );
      await logActivity({
        action: `team_compliance.overnight.${decision}`,
        page: "team-compliance/approvals",
        resource_type: "overnight_request",
        resource_id: id,
        resource_label: row.member_name,
        metadata: { requested_date: row.requested_date },
      });
      return NextResponse.json({ ok: true, request: row });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown Team compliance action." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Team compliance could not be updated.",
      },
      { status: 500 },
    );
  }
}
