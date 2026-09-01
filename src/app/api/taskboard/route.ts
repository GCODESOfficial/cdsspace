/* eslint-disable @typescript-eslint/no-explicit-any */
import { after, NextRequest, NextResponse } from "next/server";
import { glashMaybeOne, glashPool, glashQuery } from "@/lib/glashdb/postgres";
import {
  canEditBoard,
  canManageBoard,
  canViewBoard,
  canViewAllBoardTasks,
  getTaskboardViewer,
  listAccessibleBoardIds,
  logTaskboardActivity,
  notifyTaskboardMembers,
  requireTaskAccess,
  type TaskboardPortal,
  type TaskboardViewer,
} from "@/lib/taskboard/server";
import { TASK_PRIORITIES } from "@/lib/taskboard/types";
import { notifyTaskboardEvent } from "@/lib/taskboard/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function portalFrom(value: unknown): TaskboardPortal {
  return value === "team" ? "team" : "admin";
}

function cleanText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanColor(value: unknown) {
  const color = cleanText(value, 7).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : "#0A4FE8";
}

function cleanPriority(value: unknown) {
  return (TASK_PRIORITIES as readonly string[]).includes(String(value)) ? String(value) : "medium";
}

function cleanUuidList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(String).filter((item) => /^[0-9a-f-]{36}$/i.test(item)))).slice(0, 200);
}

function parseDueAt(value: unknown) {
  const raw = cleanText(value, 40);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function loadDocumentOptions(viewer: TaskboardViewer) {
  const cdocs = await glashQuery<any>(
    `select id, title, department, share_token, created_by
       from public.team_cdocs
      where coalesce(archived, false) = false
        and coalesce(is_archived, false) = false
        and coalesce(is_template, false) = false
        and ($1::boolean or created_by = $2::uuid)
      order by updated_at desc
      limit 120`,
    [viewer.kind === "admin", viewer.memberId],
  ).catch(() => []);
  const briefs = await glashQuery<any>(
    `select id, public_token,
            coalesce(nullif(brand_name, ''), nullif(invite_label, ''), 'Completed brand brief') as title,
            coalesce(nullif(industry, ''), nullif(contact_name, '')) as subtitle
       from public.brand_briefs
      where status = 'submitted'
      order by submitted_at desc nulls last, updated_at desc
      limit 120`,
  ).catch(() => []);

  return [
    ...briefs.map((brief) => ({
      id: brief.id,
      kind: "brand_brief" as const,
      title: brief.title,
      subtitle: brief.subtitle || "Completed brand brief",
      url: `/brand-brief/${brief.public_token}`,
    })),
    ...cdocs.map((doc) => ({
      id: doc.id,
      kind: "cdoc" as const,
      title: doc.title || "Untitled cDoc",
      subtitle: doc.department || "Internal cDoc",
      url: doc.share_token ? `/cdocs/${doc.share_token}` : `/team/cdocs/${doc.id}`,
    })),
  ];
}

async function addMembersToBoard(
  boardId: string,
  memberIds: string[],
  viewer: TaskboardViewer,
  role: "owner" | "editor" = "editor",
) {
  if (!memberIds.length) return;
  await glashQuery(
    `insert into public.task_board_members (board_id, team_member_id, role, added_by_id)
     select $1, m.id, $3, $4
       from public.team_members m
      where m.id = any($2::uuid[]) and m.is_active = true
     on conflict (board_id, team_member_id) do nothing`,
    [boardId, memberIds, role, viewer.id],
  );
}

async function loadTaskboard(viewer: TaskboardViewer, requestedBoardId: string | null) {
  const boardIds = await listAccessibleBoardIds(viewer);
  const ids = boardIds.map((row) => row.id);
  const boards = ids.length
    ? await glashQuery<any>(
      `select id, title, description, color, created_by_kind, created_by_id, created_at, updated_at
         from public.task_boards
        where id = any($1::uuid[]) and archived_at is null
        order by updated_at desc, created_at desc`,
      [ids],
    )
    : [];
  const boardId = requestedBoardId && ids.includes(requestedBoardId)
    ? requestedBoardId
    : boards[0]?.id || null;

  const [availableMembers, documentOptions] = await Promise.all([
    glashQuery<any>(
      `select m.id, m.full_name, m.avatar_url, m.role_title, m.department,
              coalesce(
                array_agg(distinct d.name order by d.name) filter (where d.name is not null),
                case when m.department is not null then array[m.department] else array[]::text[] end
              ) as departments
         from public.team_members m
         left join public.team_member_departments tmd on tmd.team_member_id = m.id
         left join public.departments d on d.id = tmd.department_id
        where m.is_active = true
        group by m.id
        order by m.full_name`,
    ),
    loadDocumentOptions(viewer),
  ]);

  if (!boardId) {
    return {
      ok: true as const,
      portal: viewer.portal,
      viewer: {
        kind: viewer.kind,
        id: viewer.id,
        name: viewer.name,
        can_edit: true,
        can_manage: viewer.isSuperAdmin,
        can_view_all_tasks: viewer.isSuperAdmin,
        can_add_list: true,
      },
      boards,
      board: null,
      lists: [],
      members: [],
      available_members: availableMembers,
      document_options: documentOptions,
      activity: [],
    };
  }

  const canViewAllTasks = await canViewAllBoardTasks(viewer, boardId);
  // Lists this viewer is a direct member of: they see EVERY task in these lists,
  // not just the ones assigned to them. Best-effort so the board keeps working
  // before the list-members migration is applied.
  const memberListIds: string[] = viewer.memberId
    ? (await glashQuery<{ list_id: string }>(
        `select lm.list_id
           from public.task_board_list_members lm
           join public.task_board_lists l on l.id = lm.list_id
          where l.board_id = $1 and lm.team_member_id = $2::uuid`,
        [boardId, viewer.memberId],
      ).catch(() => [])).map((row) => row.list_id)
    : [];
  const [allLists, tasks, members] = await Promise.all([
    glashQuery<any>(
      `select id, board_id, title, position, created_by_kind, created_by_id
         from public.task_board_lists
        where board_id = $1
        order by position, created_at`,
      [boardId],
    ),
    glashQuery<any>(
      `select id, board_id, list_id, title, notes, priority, due_at, position,
              completed_at, created_by_kind, created_by_id, created_by_name, created_at, updated_at,
              completed_by_kind, completed_by_id, completed_by_name
         from public.task_board_tasks t
        where board_id = $1
          and (
            $2::boolean
            or (t.created_by_kind = $3 and t.created_by_id = $4)
            or (
              $5::uuid is not null
              and exists (
                select 1
                  from public.task_board_task_assignees a
                 where a.task_id = t.id and a.team_member_id = $5::uuid
              )
            )
            or t.list_id = any($6::uuid[])
          )
        order by position, created_at`,
      [boardId, canViewAllTasks, viewer.kind, viewer.id, viewer.memberId, memberListIds],
    ),
    glashQuery<any>(
      `select m.id, m.full_name, m.avatar_url, m.role_title, m.department,
              bm.role as board_role,
              coalesce(
                array_agg(distinct d.name order by d.name) filter (where d.name is not null),
                case when m.department is not null then array[m.department] else array[]::text[] end
              ) as departments
         from public.task_board_members bm
         join public.team_members m on m.id = bm.team_member_id
         left join public.team_member_departments tmd on tmd.team_member_id = m.id
         left join public.departments d on d.id = tmd.department_id
        where bm.board_id = $1
        group by m.id, bm.role
        order by m.full_name`,
      [boardId],
    ),
  ]);

  const visibleTaskIds = tasks.map((task) => task.id);
  const [assignees, attachments, activity, comments] = await Promise.all([
    visibleTaskIds.length ? glashQuery<any>(
      `select a.task_id, m.id, m.full_name, m.avatar_url, m.role_title, m.department
         from public.task_board_task_assignees a
         join public.team_members m on m.id = a.team_member_id
        where a.task_id = any($1::uuid[])
        order by m.full_name`,
      [visibleTaskIds],
    ) : Promise.resolve([]),
    visibleTaskIds.length ? glashQuery<any>(
      `select a.id, a.task_id, a.kind, a.title, a.url, a.mime_type, a.size_bytes, a.created_at
         from public.task_board_attachments a
        where a.task_id = any($1::uuid[])
        order by a.created_at`,
      [visibleTaskIds],
    ) : Promise.resolve([]),
    canViewAllTasks ? glashQuery<any>(
      `select id, board_id, task_id, actor_kind, actor_name, event_type, detail, created_at
         from public.task_board_activity
        where board_id = $1
        order by created_at desc
        limit 40`,
      [boardId],
    ) : visibleTaskIds.length ? glashQuery<any>(
      `select id, board_id, task_id, actor_kind, actor_name, event_type, detail, created_at
         from public.task_board_activity
        where board_id = $1 and task_id = any($2::uuid[])
        order by created_at desc
        limit 40`,
      [boardId, visibleTaskIds],
    ) : Promise.resolve([]),
    visibleTaskIds.length ? glashQuery<any>(
      `select id, task_id, author_kind, author_id, author_name, body, created_at
         from public.task_board_task_comments
        where task_id = any($1::uuid[])
        order by created_at`,
      [visibleTaskIds],
    ) : Promise.resolve([]),
  ]);

  const assigneesByTask = new Map<string, any[]>();
  for (const row of assignees) {
    const bucket = assigneesByTask.get(row.task_id) || [];
    bucket.push({
      id: row.id,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      role_title: row.role_title,
      department: row.department,
    });
    assigneesByTask.set(row.task_id, bucket);
  }
  const attachmentsByTask = new Map<string, any[]>();
  for (const row of attachments) {
    const bucket = attachmentsByTask.get(row.task_id) || [];
    bucket.push(row);
    attachmentsByTask.set(row.task_id, bucket);
  }
  const commentsByTask = new Map<string, any[]>();
  for (const row of comments) {
    const bucket = commentsByTask.get(row.task_id) || [];
    bucket.push(row);
    commentsByTask.set(row.task_id, bucket);
  }
  const tasksByList = new Map<string, any[]>();
  for (const task of tasks) {
    const bucket = tasksByList.get(task.list_id) || [];
    bucket.push({
      ...task,
      assignees: assigneesByTask.get(task.id) || [],
      attachments: attachmentsByTask.get(task.id) || [],
      comments: commentsByTask.get(task.id) || [],
    });
    tasksByList.set(task.list_id, bucket);
  }

  // Direct list members, grouped by list, for display + management.
  const listMemberRows = await glashQuery<any>(
    `select lm.list_id, m.id, m.full_name, m.avatar_url, m.role_title, m.department
       from public.task_board_list_members lm
       join public.team_members m on m.id = lm.team_member_id
       join public.task_board_lists l on l.id = lm.list_id
      where l.board_id = $1
      order by m.full_name`,
    [boardId],
  ).catch(() => []);
  const listMembersByList = new Map<string, any[]>();
  for (const row of listMemberRows) {
    const bucket = listMembersByList.get(row.list_id) || [];
    bucket.push({
      id: row.id,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      role_title: row.role_title,
      department: row.department,
    });
    listMembersByList.set(row.list_id, bucket);
  }

  const [editable, manageable] = await Promise.all([
    canEditBoard(viewer, boardId),
    canManageBoard(viewer, boardId),
  ]);
  const lists = canViewAllTasks
    ? allLists
    : allLists.filter((list) => (
      tasksByList.has(list.id)
      || (list.created_by_kind === viewer.kind && list.created_by_id === viewer.id)
      || memberListIds.includes(list.id)
    ));
  // Non-admin team members can create at most 2 lists per board. Admin-role
  // users (admin portal, super admin, or a sub-admin team member) are unlimited.
  const hasAdminRole = viewer.kind === "admin" || viewer.isSuperAdmin || viewer.team?.is_sub_admin === true;
  const listsByViewer = allLists.filter(
    (list) => list.created_by_kind === viewer.kind && list.created_by_id === viewer.id,
  ).length;
  const canAddList = editable && (hasAdminRole || listsByViewer < 2);
  return {
    ok: true as const,
    portal: viewer.portal,
    viewer: {
      kind: viewer.kind,
      id: viewer.id,
      name: viewer.name,
      can_edit: editable,
      can_manage: manageable,
      can_view_all_tasks: canViewAllTasks,
      can_add_list: canAddList,
    },
    boards,
    board: boards.find((board) => board.id === boardId) || null,
    lists: lists.map((list) => ({
      ...list,
      tasks: tasksByList.get(list.id) || [],
      members: listMembersByList.get(list.id) || [],
    })),
    members,
    available_members: availableMembers,
    document_options: documentOptions,
    activity,
  };
}

async function focusOptions(viewer: TaskboardViewer) {
  if (!viewer.memberId) return [];
  return glashQuery<any>(
    `select
        t.id, t.title, t.notes, t.priority, t.due_at, t.completed_at,
        b.id as board_id, b.title as board_title,
        l.id as list_id, l.title as list_title
       from public.task_board_tasks t
       join public.task_boards b on b.id = t.board_id and b.archived_at is null
       join public.task_board_lists l on l.id = t.list_id
      where t.completed_at is null
        and (
          (t.created_by_kind = 'team' and t.created_by_id = $1::text)
          or exists (
            select 1
              from public.task_board_task_assignees a
             where a.task_id = t.id and a.team_member_id = $1::uuid
          )
        )
      order by t.due_at nulls last, t.updated_at desc
      limit 120`,
    [viewer.memberId],
  );
}

export async function GET(req: NextRequest) {
  const portal = portalFrom(req.nextUrl.searchParams.get("portal"));
  const viewer = await getTaskboardViewer(portal);
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    if (req.nextUrl.searchParams.get("focus") === "1") {
      return NextResponse.json({ ok: true, tasks: await focusOptions(viewer) });
    }
    return NextResponse.json(
      await loadTaskboard(viewer, req.nextUrl.searchParams.get("board_id")),
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Taskboard is not ready." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const portal = portalFrom(body.portal);
  const viewer = await getTaskboardViewer(portal);
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const action = cleanText(body.action, 80);
  const boardId = cleanText(body.board_id, 40);

  try {
    if (action === "create_board") {
      // Boards are created from the admin end only, never the team dashboard.
      if (portal === "team") {
        return NextResponse.json({ ok: false, error: "Boards can only be created from the admin dashboard." }, { status: 403 });
      }
      const title = cleanText(body.title, 120);
      if (!title) return NextResponse.json({ ok: false, error: "Board title is required." }, { status: 400 });
      const memberIds = cleanUuidList(body.member_ids);
      if (viewer.memberId && !memberIds.includes(viewer.memberId)) memberIds.push(viewer.memberId);
      const client = await glashPool.connect();
      try {
        await client.query("begin");
        const created = (await client.query<any>(
          `insert into public.task_boards
            (title, description, color, created_by_kind, created_by_id)
           values ($1,$2,$3,$4,$5)
           returning *`,
          [title, cleanText(body.description, 600) || null, cleanColor(body.color), viewer.kind, viewer.id],
        )).rows[0];
        const defaults = ["Inbox", "This week", "In progress", "Review", "Done"];
        for (let index = 0; index < defaults.length; index += 1) {
          await client.query(
            `insert into public.task_board_lists
              (board_id, title, position, created_by_kind, created_by_id)
             values ($1,$2,$3,$4,$5)`,
            [created.id, defaults[index], (index + 1) * 1000, viewer.kind, viewer.id],
          );
        }
        for (const memberId of memberIds) {
          await client.query(
            `insert into public.task_board_members (board_id, team_member_id, role, added_by_id)
             values ($1,$2,$3,$4)
             on conflict (board_id, team_member_id) do nothing`,
            [created.id, memberId, memberId === viewer.memberId ? "owner" : "editor", viewer.id],
          );
        }
        await client.query("commit");
        await logTaskboardActivity(viewer, {
          boardId: created.id,
          eventType: "board_created",
          detail: `Created ${title}`,
        });
        return NextResponse.json({ ok: true, board: created });
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }

    // Completion is deliberately resolved before the broader board-edit gate.
    // One atomic statement both authorizes the viewer and persists the state,
    // so every board/list member or direct assignee can complete visible work
    // without depending on list-management privileges.
    if (action === "set_task_completion") {
      const taskId = cleanText(body.task_id, 40);
      if (!boardId || !taskId) {
        return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      }
      const completed = body.completed === true;
      const updated = await glashMaybeOne<{
        id: string;
        title: string;
        previous_completed_at: string | null;
        completed_at: string | null;
        completed_by_kind: "admin" | "team" | null;
        completed_by_id: string | null;
        completed_by_name: string | null;
      }>(
        `with accessible_task as (
           select t.id, t.title, t.completed_at as previous_completed_at
             from public.task_board_tasks t
             join public.task_boards b on b.id = t.board_id and b.archived_at is null
            where t.id = $1 and t.board_id = $2
              and (
                $3::boolean
                or (b.created_by_kind = $4 and b.created_by_id = $5)
                or (t.created_by_kind = $4 and t.created_by_id = $5)
                or (
                  $6::uuid is not null
                  and (
                    exists (
                      select 1 from public.task_board_members bm
                       where bm.board_id = t.board_id
                         and bm.team_member_id = $6::uuid
                         and coalesce(t.source_type, '') <> 'project_task'
                    )
                    or exists (
                      select 1 from public.task_board_list_members lm
                       where lm.list_id = t.list_id and lm.team_member_id = $6::uuid
                    )
                    or exists (
                      select 1 from public.task_board_task_assignees a
                       where a.task_id = t.id and a.team_member_id = $6::uuid
                    )
                  )
                )
              )
            for update of t
         )
         update public.task_board_tasks t
            set completed_at = case when $7 then coalesce(t.completed_at, now()) else null end,
                completed_by_kind = case when $7 then coalesce(t.completed_by_kind, $4) else null end,
                completed_by_id   = case when $7 then coalesce(t.completed_by_id, $5) else null end,
                completed_by_name = case when $7 then coalesce(t.completed_by_name, $8) else null end,
                updated_at = now()
           from accessible_task a
          where t.id = a.id
          returning t.id, a.title, a.previous_completed_at,
                    t.completed_at, t.completed_by_kind,
                    t.completed_by_id, t.completed_by_name`,
        [taskId, boardId, viewer.isSuperAdmin, viewer.kind, viewer.id, viewer.memberId, completed, viewer.name],
      );
      if (!updated) {
        return NextResponse.json({ ok: false, error: "Task not found or access denied." }, { status: 403 });
      }
      const becameCompleted = completed && !updated.previous_completed_at;
      const becameReopened = !completed && !!updated.previous_completed_at;
      if (becameCompleted || becameReopened) {
        after(async () => {
          await logTaskboardActivity(viewer, {
            boardId,
            taskId,
            eventType: becameCompleted ? "task_completed" : "task_reopened",
            detail: becameCompleted ? `Completed ${updated.title}` : `Reopened ${updated.title}`,
          });
          if (becameCompleted) {
            await notifyTaskboardEvent({
              event: "completed",
              boardId,
              taskId,
              actorName: viewer.name,
              actorIsAdmin: viewer.kind === "admin",
            });
          }
        });
      }
      return NextResponse.json({
        ok: true,
        task: {
          id: updated.id,
          completed_at: updated.completed_at,
          completed_by_kind: updated.completed_by_kind,
          completed_by_id: updated.completed_by_id,
          completed_by_name: updated.completed_by_name,
        },
      });
    }

    if (!boardId || !(await canViewBoard(viewer, boardId))) {
      return NextResponse.json({ ok: false, error: "Board not found or access denied." }, { status: 403 });
    }

    const editable = await canEditBoard(viewer, boardId);
    if (!editable) {
      return NextResponse.json({ ok: false, error: "This board is view only." }, { status: 403 });
    }
    if (
      [
        "update_board",
        "archive_board",
        "add_member",
        "remove_member",
      ].includes(action)
      && !(await canManageBoard(viewer, boardId))
    ) {
      return NextResponse.json({ ok: false, error: "Only a board owner can manage this board." }, { status: 403 });
    }

    if (action === "update_board") {
      const title = cleanText(body.title, 120);
      if (!title) return NextResponse.json({ ok: false, error: "Board title is required." }, { status: 400 });
      const board = await glashMaybeOne<any>(
        `update public.task_boards
            set title = $2, description = $3, color = $4, updated_at = now()
          where id = $1
          returning *`,
        [boardId, title, cleanText(body.description, 600) || null, cleanColor(body.color)],
      );
      await logTaskboardActivity(viewer, { boardId, eventType: "board_updated", detail: `Updated ${title}` });
      return NextResponse.json({ ok: true, board });
    }

    if (action === "archive_board") {
      await glashQuery("update public.task_boards set archived_at = now() where id = $1", [boardId]);
      await logTaskboardActivity(viewer, { boardId, eventType: "board_archived", detail: "Archived board" });
      return NextResponse.json({ ok: true });
    }

    if (action === "create_list") {
      const title = cleanText(body.title, 80);
      if (!title) return NextResponse.json({ ok: false, error: "List title is required." }, { status: 400 });
      // Cap non-admin team members at 2 self-created lists per board. Admin-role
      // users (admin portal, super admin, or sub-admin team member) are unlimited.
      const hasAdminRole = viewer.kind === "admin" || viewer.isSuperAdmin || viewer.team?.is_sub_admin === true;
      if (!hasAdminRole) {
        const owned = await glashMaybeOne<{ count: string }>(
          `select count(*)::text as count
             from public.task_board_lists
            where board_id = $1 and created_by_kind = $2 and created_by_id = $3`,
          [boardId, viewer.kind, viewer.id],
        );
        if (Number(owned?.count || 0) >= 2) {
          return NextResponse.json(
            { ok: false, error: "You can create up to 2 lists. Ask a board owner or admin to add more." },
            { status: 403 },
          );
        }
      }
      const list = await glashMaybeOne<any>(
        `insert into public.task_board_lists
          (board_id, title, position, created_by_kind, created_by_id)
         values (
           $1,$2,
           coalesce((select max(position) + 1000 from public.task_board_lists where board_id = $1),1000),
           $3,$4
         )
         returning *`,
        [boardId, title, viewer.kind, viewer.id],
      );
      await logTaskboardActivity(viewer, { boardId, eventType: "list_created", detail: `Added list ${title}` });
      return NextResponse.json({ ok: true, list });
    }

    if (action === "update_list") {
      const listId = cleanText(body.list_id, 40);
      const title = cleanText(body.title, 80);
      if (!listId || !title) return NextResponse.json({ ok: false, error: "List and title are required." }, { status: 400 });
      const list = await glashMaybeOne<{ created_by_kind: "admin" | "team" | null; created_by_id: string | null }>(
        `select created_by_kind, created_by_id
           from public.task_board_lists
          where id = $1 and board_id = $2
          limit 1`,
        [listId, boardId],
      );
      if (!list) {
        return NextResponse.json({ ok: false, error: "List not found." }, { status: 404 });
      }
      const canManageList = await canManageBoard(viewer, boardId)
        || (list.created_by_kind === viewer.kind && list.created_by_id === viewer.id);
      if (!canManageList) {
        return NextResponse.json({ ok: false, error: "Only the list creator or board owner can rename this list." }, { status: 403 });
      }
      await glashQuery(
        `update public.task_board_lists set title = $3, updated_at = now()
          where id = $1 and board_id = $2`,
        [listId, boardId, title],
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_list") {
      const listId = cleanText(body.list_id, 40);
      const list = await glashMaybeOne<{ created_by_kind: "admin" | "team" | null; created_by_id: string | null }>(
        `select created_by_kind, created_by_id
           from public.task_board_lists
          where id = $1 and board_id = $2
          limit 1`,
        [listId, boardId],
      );
      if (!list) {
        return NextResponse.json({ ok: false, error: "List not found." }, { status: 404 });
      }
      const canManageList = await canManageBoard(viewer, boardId)
        || (list.created_by_kind === viewer.kind && list.created_by_id === viewer.id);
      if (!canManageList) {
        return NextResponse.json({ ok: false, error: "Only the list creator or board owner can delete this list." }, { status: 403 });
      }
      const taskCount = await glashMaybeOne<{ count: string }>(
        "select count(*)::text as count from public.task_board_tasks where list_id = $1 and board_id = $2",
        [listId, boardId],
      );
      if (Number(taskCount?.count || 0) > 0) {
        return NextResponse.json({ ok: false, error: "Move or delete the tasks in this list first." }, { status: 409 });
      }
      await glashQuery("delete from public.task_board_lists where id = $1 and board_id = $2", [listId, boardId]);
      return NextResponse.json({ ok: true });
    }

    if (action === "add_list_members" || action === "remove_list_member") {
      const listId = cleanText(body.list_id, 40);
      const list = await glashMaybeOne<{ created_by_kind: "admin" | "team" | null; created_by_id: string | null }>(
        `select created_by_kind, created_by_id
           from public.task_board_lists
          where id = $1 and board_id = $2
          limit 1`,
        [listId, boardId],
      );
      if (!list) {
        return NextResponse.json({ ok: false, error: "List not found." }, { status: 404 });
      }
      const canManageList = await canManageBoard(viewer, boardId)
        || (list.created_by_kind === viewer.kind && list.created_by_id === viewer.id);
      if (!canManageList) {
        return NextResponse.json({ ok: false, error: "Only the list creator or board owner can manage list members." }, { status: 403 });
      }

      if (action === "remove_list_member") {
        const memberId = cleanText(body.member_id, 40);
        if (!memberId) return NextResponse.json({ ok: false, error: "Member is required." }, { status: 400 });
        await glashQuery(
          "delete from public.task_board_list_members where list_id = $1 and team_member_id = $2::uuid",
          [listId, memberId],
        );
        return NextResponse.json({ ok: true });
      }

      const memberIds = cleanUuidList(body.member_ids);
      if (!memberIds.length) {
        return NextResponse.json({ ok: false, error: "Select at least one team member." }, { status: 400 });
      }
      // Members of a list also need board access, so add them to the board too.
      await addMembersToBoard(boardId, memberIds, viewer);
      for (const memberId of memberIds) {
        await glashQuery(
          `insert into public.task_board_list_members (list_id, team_member_id, added_by_id)
           values ($1, $2::uuid, $3)
           on conflict (list_id, team_member_id) do nothing`,
          [listId, memberId, viewer.id],
        );
      }
      await logTaskboardActivity(viewer, {
        boardId,
        eventType: "list_members_added",
        detail: memberIds.length === 1 ? "Added a person to a list" : `Added ${memberIds.length} people to a list`,
      });
      await notifyTaskboardMembers({
        memberIds: memberIds.filter((memberId) => memberId !== viewer.memberId),
        title: "Added to a task list",
        body: `${viewer.name} added you to a list on the Taskboard.`,
        boardId,
        actorIsAdmin: viewer.kind === "admin",
      });
      return NextResponse.json({ ok: true, added: memberIds.length });
    }

    if (action === "create_task") {
      const listId = cleanText(body.list_id, 40);
      const title = cleanText(body.title, 180);
      if (!listId || !title) return NextResponse.json({ ok: false, error: "Task title is required." }, { status: 400 });
      const list = await glashMaybeOne<{ id: string }>(
        "select id from public.task_board_lists where id = $1 and board_id = $2",
        [listId, boardId],
      );
      if (!list) return NextResponse.json({ ok: false, error: "List not found." }, { status: 404 });
      const task = await glashMaybeOne<any>(
        `insert into public.task_board_tasks
          (board_id, list_id, title, notes, priority, due_at, position, created_by_kind, created_by_id, created_by_name)
         values (
           $1,$2,$3,$4,$5,$6,
           coalesce((select max(position) + 1000 from public.task_board_tasks where list_id = $2),1000),
           $7,$8,$9
         )
         returning *`,
        [
          boardId,
          listId,
          title,
          cleanText(body.notes, 4000) || null,
          cleanPriority(body.priority),
          parseDueAt(body.due_at),
          viewer.kind,
          viewer.id,
          viewer.name,
        ],
      );
      const assigneeIds = cleanUuidList(body.assignee_ids);
      if (viewer.kind === "team" && viewer.memberId && assigneeIds.length === 0) {
        assigneeIds.push(viewer.memberId);
      }
      await addMembersToBoard(boardId, assigneeIds, viewer);
      for (const memberId of assigneeIds) {
        await glashQuery(
          `insert into public.task_board_task_assignees (task_id, team_member_id, assigned_by_id)
           values ($1, $2::uuid, $3)
           on conflict (task_id, team_member_id) do nothing`,
          [task?.id, memberId, viewer.id],
        );
      }
      await logTaskboardActivity(viewer, {
        boardId,
        taskId: task?.id,
        eventType: "task_created",
        detail: `Created ${title}`,
      });
      if (task?.id) {
        after(async () => {
          await notifyTaskboardEvent({
            event: "created",
            boardId,
            taskId: task.id,
            actorName: viewer.name,
            actorIsAdmin: viewer.kind === "admin",
          });
        });
      }
      return NextResponse.json({ ok: true, task });
    }

    if (action === "duplicate_task") {
      const sourceTaskId = cleanText(body.task_id, 40);
      const accessibleTask = sourceTaskId ? await requireTaskAccess(viewer, sourceTaskId) : null;
      if (!accessibleTask || accessibleTask.board_id !== boardId) {
        return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      }

      const client = await glashPool.connect();
      let duplicatedTask: any = null;
      try {
        await client.query("begin");
        const source = (await client.query<any>(
          `select id, board_id, list_id, title, notes, priority, due_at
             from public.task_board_tasks
            where id = $1 and board_id = $2
            limit 1
            for share`,
          [sourceTaskId, boardId],
        )).rows[0];
        if (!source) throw new Error("Task not found.");

        const duplicateTitle = `${cleanText(source.title, 175)} copy`;
        duplicatedTask = (await client.query<any>(
          `insert into public.task_board_tasks
            (board_id, list_id, title, notes, priority, due_at, position,
             created_by_kind, created_by_id, created_by_name)
           values (
             $1,$2,$3,$4,$5,$6,
             coalesce((select max(position) + 1000 from public.task_board_tasks where list_id = $2),1000),
             $7,$8,$9
           )
           returning *`,
          [
            boardId,
            source.list_id,
            duplicateTitle,
            source.notes,
            source.priority,
            source.due_at,
            viewer.kind,
            viewer.id,
            viewer.name,
          ],
        )).rows[0];

        await client.query(
          `insert into public.task_board_task_assignees (task_id, team_member_id, assigned_by_id)
           select $2::uuid, a.team_member_id, $3
             from public.task_board_task_assignees a
            where a.task_id = $1::uuid
           on conflict (task_id, team_member_id) do nothing`,
          [sourceTaskId, duplicatedTask.id, viewer.id],
        );
        await client.query(
          `insert into public.task_board_attachments
            (task_id, kind, title, url, storage_path, mime_type, size_bytes,
             created_by_kind, created_by_id)
           select $2::uuid, a.kind, a.title, a.url, a.storage_path, a.mime_type,
                  a.size_bytes, $3, $4
             from public.task_board_attachments a
            where a.task_id = $1::uuid`,
          [sourceTaskId, duplicatedTask.id, viewer.kind, viewer.id],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }

      await logTaskboardActivity(viewer, {
        boardId,
        taskId: duplicatedTask.id,
        eventType: "task_duplicated",
        detail: `Duplicated ${accessibleTask.title}`,
        metadata: { source_task_id: sourceTaskId },
      });
      after(async () => {
        await notifyTaskboardEvent({
          event: "created",
          boardId,
          taskId: duplicatedTask.id,
          actorName: viewer.name,
          actorIsAdmin: viewer.kind === "admin",
        });
      });
      return NextResponse.json({ ok: true, task: duplicatedTask });
    }

    if (action === "update_task") {
      const taskId = cleanText(body.task_id, 40);
      const task = taskId ? await requireTaskAccess(viewer, taskId) : null;
      if (!task || task.board_id !== boardId) {
        return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      }
      const title = cleanText(body.title, 180);
      if (!title) return NextResponse.json({ ok: false, error: "Task title is required." }, { status: 400 });
      const completed = body.completed === true;
      const becameCompleted = completed && !task.completed_at;
      const becameReopened = !completed && !!task.completed_at;
      const existingAssignees = await glashQuery<{ team_member_id: string }>(
        `select team_member_id
           from public.task_board_task_assignees
          where task_id = $1`,
        [taskId],
      );
      await glashQuery(
        `update public.task_board_tasks
            set title = $3,
                notes = $4,
                priority = $5,
                due_at = $6,
                completed_at = case when $7 then coalesce(completed_at, now()) else null end,
                completed_by_kind = case when $7 then coalesce(completed_by_kind, $8) else null end,
                completed_by_id   = case when $7 then coalesce(completed_by_id, $9) else null end,
                completed_by_name = case when $7 then coalesce(completed_by_name, $10) else null end,
                updated_at = now()
          where id = $1 and board_id = $2`,
        [
          taskId,
          boardId,
          title,
          cleanText(body.notes, 4000) || null,
          cleanPriority(body.priority),
          parseDueAt(body.due_at),
          completed,
          viewer.kind,
          viewer.id,
          viewer.name,
        ],
      );
      // Optional list move: relocate the task to another list on the same board
      // and drop it at the end of that list.
      const newListId = cleanText(body.list_id, 40);
      if (newListId && newListId !== task.list_id) {
        const targetList = await glashMaybeOne<{ id: string }>(
          "select id from public.task_board_lists where id = $1 and board_id = $2",
          [newListId, boardId],
        );
        if (!targetList) {
          return NextResponse.json({ ok: false, error: "Target list not found." }, { status: 404 });
        }
        await glashQuery(
          `update public.task_board_tasks
              set list_id = $3,
                  position = coalesce((select max(position) + 1000 from public.task_board_tasks where list_id = $3), 1000),
                  updated_at = now()
            where id = $1 and board_id = $2`,
          [taskId, boardId, newListId],
        );
        await logTaskboardActivity(viewer, {
          boardId,
          taskId,
          eventType: "task_moved",
          detail: `Moved ${title}`,
        });
      }
      const assigneeIds = cleanUuidList(body.assignee_ids);
      await addMembersToBoard(boardId, assigneeIds, viewer);
      await glashQuery("delete from public.task_board_task_assignees where task_id = $1", [taskId]);
      for (const memberId of assigneeIds) {
        await glashQuery(
          `insert into public.task_board_task_assignees (task_id, team_member_id, assigned_by_id)
           values ($1, $2::uuid, $3)
           on conflict (task_id, team_member_id) do nothing`,
          [taskId, memberId, viewer.id],
        );
      }
      await logTaskboardActivity(viewer, {
        boardId,
        taskId,
        eventType: becameCompleted ? "task_completed" : becameReopened ? "task_reopened" : "task_updated",
        detail: becameCompleted ? `Completed ${title}` : becameReopened ? `Reopened ${title}` : `Updated ${title}`,
      });
      const existingIds = new Set(existingAssignees.map((row) => row.team_member_id));
      const newlyAssignedIds = assigneeIds.filter(
        (memberId) => memberId !== viewer.memberId && !existingIds.has(memberId),
      );
      await notifyTaskboardMembers({
        memberIds: newlyAssignedIds,
        title: `Added to task: ${title}`,
        body: `${viewer.name} added you to a task on the Taskboard.`,
        boardId,
        taskId,
        actorIsAdmin: viewer.kind === "admin",
      });
      if (becameCompleted) {
        after(async () => {
          await notifyTaskboardEvent({
            event: "completed",
            boardId,
            taskId,
            actorName: viewer.name,
            actorIsAdmin: viewer.kind === "admin",
          });
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_task") {
      const taskId = cleanText(body.task_id, 40);
      const task = taskId ? await requireTaskAccess(viewer, taskId) : null;
      if (!task || task.board_id !== boardId) {
        return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      }
      await logTaskboardActivity(viewer, {
        boardId,
        taskId,
        eventType: "task_deleted",
        detail: `Deleted ${task.title}`,
      });
      await glashQuery("delete from public.task_board_tasks where id = $1 and board_id = $2", [taskId, boardId]);
      return NextResponse.json({ ok: true });
    }

    if (action === "add_comment") {
      const taskId = cleanText(body.task_id, 40);
      const task = taskId ? await requireTaskAccess(viewer, taskId) : null;
      if (!task || task.board_id !== boardId) {
        return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      }
      const commentBody = cleanText(body.body, 4000);
      if (!commentBody) return NextResponse.json({ ok: false, error: "Comment cannot be empty." }, { status: 400 });
      const comment = await glashMaybeOne<any>(
        `insert into public.task_board_task_comments (task_id, author_kind, author_id, author_name, body)
         values ($1,$2,$3,$4,$5)
         returning id, task_id, author_kind, author_id, author_name, body, created_at`,
        [taskId, viewer.kind, viewer.id, viewer.name, commentBody],
      );
      await logTaskboardActivity(viewer, { boardId, taskId, eventType: "comment_added", detail: `Commented on ${task.title}` });
      return NextResponse.json({ ok: true, comment });
    }

    if (action === "delete_comment") {
      const commentId = cleanText(body.comment_id, 40);
      const row = await glashMaybeOne<{ author_kind: string; author_id: string; task_id: string }>(
        `select c.author_kind, c.author_id, c.task_id
           from public.task_board_task_comments c
           join public.task_board_tasks t on t.id = c.task_id
          where c.id = $1 and t.board_id = $2
          limit 1`,
        [commentId, boardId],
      );
      if (!row) return NextResponse.json({ ok: false, error: "Comment not found." }, { status: 404 });
      const canDelete = (row.author_kind === viewer.kind && row.author_id === viewer.id)
        || await canManageBoard(viewer, boardId);
      if (!canDelete) return NextResponse.json({ ok: false, error: "You can only remove your own comment." }, { status: 403 });
      await glashQuery("delete from public.task_board_task_comments where id = $1", [commentId]);
      return NextResponse.json({ ok: true });
    }

    if (action === "reorder") {
      const columns = Array.isArray(body.columns) ? body.columns.slice(0, 80) : [];
      const canReorderAll = await canViewAllBoardTasks(viewer, boardId);
      const client = await glashPool.connect();
      try {
        await client.query("begin");
        for (let listIndex = 0; listIndex < columns.length; listIndex += 1) {
          const listId = cleanText(columns[listIndex]?.list_id, 40);
          const taskIds = cleanUuidList(columns[listIndex]?.task_ids);
          const ownsList = await client.query(
            `select l.id
               from public.task_board_lists l
              where l.id = $1 and l.board_id = $2
                and (
                  $3::boolean
                  or exists (
                    select 1
                      from public.task_board_tasks t
                     where t.list_id = l.id
                       and (
                         (t.created_by_kind = $4 and t.created_by_id = $5)
                         or (
                           $6::uuid is not null
                           and exists (
                             select 1
                               from public.task_board_task_assignees a
                              where a.task_id = t.id and a.team_member_id = $6::uuid
                           )
                         )
                       )
                  )
                  or exists (
                    -- Allow the destination list of a cross-list move: the task
                    -- being dropped here is owned by the viewer even though it
                    -- hasn't been reassigned to this list in the DB yet.
                    select 1
                      from public.task_board_tasks t
                     where t.id = any($7::uuid[])
                       and (
                         (t.created_by_kind = $4 and t.created_by_id = $5)
                         or (
                           $6::uuid is not null
                           and exists (
                             select 1
                               from public.task_board_task_assignees a
                              where a.task_id = t.id and a.team_member_id = $6::uuid
                           )
                         )
                       )
                  )
                )`,
            [listId, boardId, canReorderAll, viewer.kind, viewer.id, viewer.memberId, taskIds],
          );
          // A board shows lists the viewer owns nothing in, for instance a list
          // they are a member of. Those columns are sent back with everything
          // else, and failing the whole request on them meant a team member
          // could not save any move at all. Skip them instead: the per task
          // update below still enforces who may move what, and the list
          // position update is already gated on canReorderAll.
          if (!ownsList.rowCount) continue;
          if (canReorderAll) {
            await client.query(
              "update public.task_board_lists set position = $3 where id = $1 and board_id = $2",
              [listId, boardId, (listIndex + 1) * 1000],
            );
          }
          for (let taskIndex = 0; taskIndex < taskIds.length; taskIndex += 1) {
            await client.query(
              `update public.task_board_tasks
                  set list_id = $3, position = $4, updated_at = now()
                where id = $1 and board_id = $2
                  and (
                    $5::boolean
                    or (created_by_kind = $6 and created_by_id = $7)
                    or (
                      $8::uuid is not null
                      and exists (
                        select 1
                          from public.task_board_task_assignees a
                         where a.task_id = task_board_tasks.id
                           and a.team_member_id = $8::uuid
                      )
                    )
                  )`,
              [
                taskIds[taskIndex],
                boardId,
                listId,
                (taskIndex + 1) * 1000,
                canReorderAll,
                viewer.kind,
                viewer.id,
                viewer.memberId,
              ],
            );
          }
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "add_member") {
      const requestedIds = cleanUuidList([
        ...(Array.isArray(body.member_ids) ? body.member_ids : []),
        ...(body.member_id ? [body.member_id] : []),
      ]);
      const selectedMembers = requestedIds.length ? await glashQuery<{ id: string; full_name: string }>(
        `select id, full_name
           from public.team_members
          where id = any($1::uuid[]) and is_active = true
          order by full_name`,
        [requestedIds],
      ) : [];
      if (!selectedMembers.length) {
        return NextResponse.json({ ok: false, error: "Select at least one active team member." }, { status: 400 });
      }
      const existingMembers = await glashQuery<{ team_member_id: string }>(
        `select team_member_id
           from public.task_board_members
          where board_id = $1 and team_member_id = any($2::uuid[])`,
        [boardId, selectedMembers.map((member) => member.id)],
      );
      await addMembersToBoard(boardId, selectedMembers.map((member) => member.id), viewer);
      const existingIds = new Set(existingMembers.map((member) => member.team_member_id));
      const addedMembers = selectedMembers.filter((member) => !existingIds.has(member.id));
      await logTaskboardActivity(viewer, {
        boardId,
        eventType: "member_added",
        detail: addedMembers.length === 1
          ? `Added ${addedMembers[0].full_name}`
          : `Added ${addedMembers.length} board members`,
      });
      await notifyTaskboardMembers({
        memberIds: addedMembers.map((member) => member.id).filter((memberId) => memberId !== viewer.memberId),
        title: "Added to a Taskboard",
        body: `${viewer.name} added you to a shared task board.`,
        boardId,
        actorIsAdmin: viewer.kind === "admin",
      });
      return NextResponse.json({ ok: true, added: addedMembers.length });
    }

    if (action === "remove_member") {
      const memberId = cleanText(body.member_id, 40);
      if (memberId === viewer.memberId && viewer.kind === "team") {
        return NextResponse.json({ ok: false, error: "You cannot remove yourself from the board you are editing." }, { status: 409 });
      }
      await glashQuery(
        "delete from public.task_board_members where board_id = $1 and team_member_id = $2",
        [boardId, memberId],
      );
      await glashQuery(
        `delete from public.task_board_task_assignees a
          using public.task_board_tasks t
          where a.task_id = t.id and t.board_id = $1 and a.team_member_id = $2`,
        [boardId, memberId],
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "add_attachment") {
      const taskId = cleanText(body.task_id, 40);
      const task = taskId ? await requireTaskAccess(viewer, taskId) : null;
      if (!task || task.board_id !== boardId) {
        return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      }
      const kind: "external" | "cdoc" | "brand_brief" = body.kind === "cdoc"
        ? "cdoc"
        : body.kind === "brand_brief"
          ? "brand_brief"
          : "external";
      let title = cleanText(body.title, 180);
      let rawUrl = cleanText(body.url, 1200);
      if (kind === "brand_brief") {
        const documentId = cleanText(body.document_id, 40);
        const brief = await glashMaybeOne<{ title: string; public_token: string }>(
          `select coalesce(nullif(brand_name, ''), nullif(invite_label, ''), 'Completed brand brief') as title,
                  public_token
             from public.brand_briefs
            where id = $1 and status = 'submitted'
            limit 1`,
          [documentId],
        );
        if (!brief) {
          return NextResponse.json({ ok: false, error: "Completed brand brief not found." }, { status: 404 });
        }
        title = brief.title;
        rawUrl = `/brand-brief/${brief.public_token}`;
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl, req.nextUrl.origin);
      } catch {
        return NextResponse.json({ ok: false, error: "Enter a valid document URL." }, { status: 400 });
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return NextResponse.json({ ok: false, error: "Only HTTP and HTTPS links are supported." }, { status: 400 });
      }
      const attachment = await glashMaybeOne<any>(
        `insert into public.task_board_attachments
          (task_id, kind, title, url, created_by_kind, created_by_id)
         values ($1,$2,$3,$4,$5,$6)
         returning *`,
        [
          taskId,
          kind,
          title || (kind === "cdoc" ? "Internal document" : kind === "brand_brief" ? "Completed brand brief" : parsedUrl.hostname),
          parsedUrl.toString(),
          viewer.kind,
          viewer.id,
        ],
      );
      await logTaskboardActivity(viewer, {
        boardId,
        taskId,
        eventType: "attachment_added",
        detail: `Attached ${attachment?.title || "document"}`,
      });
      return NextResponse.json({ ok: true, attachment });
    }

    if (action === "remove_attachment") {
      const attachmentId = cleanText(body.attachment_id, 40);
      const attachment = await glashMaybeOne<{ task_id: string }>(
        `select a.task_id
           from public.task_board_attachments a
           join public.task_board_tasks t on t.id = a.task_id
          where a.id = $1 and t.board_id = $2
          limit 1`,
        [attachmentId, boardId],
      );
      if (!attachment || !(await requireTaskAccess(viewer, attachment.task_id))) {
        return NextResponse.json({ ok: false, error: "Attachment not found." }, { status: 404 });
      }
      await glashQuery(
        `delete from public.task_board_attachments a
          using public.task_board_tasks t
          where a.id = $1 and a.task_id = t.id and t.board_id = $2`,
        [attachmentId, boardId],
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unsupported Taskboard action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Taskboard action failed." },
      { status: 500 },
    );
  }
}
