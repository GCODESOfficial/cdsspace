/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getChatViewer } from "@/lib/team-chat-auth";
import { canViewTeamThread, getViewerReactionKey, isAttachmentRestrictedThread } from "@/lib/team-chat-server";
import { glashQuery } from "@/lib/glashdb/postgres";
import { canShareProtectedChatResource } from "@/lib/chat-resource-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireThread(viewer: NonNullable<Awaited<ReturnType<typeof getChatViewer>>>, threadId: string) {
  if (!threadId) return NextResponse.json({ ok: false, error: "threadId required" }, { status: 400 });
  if (!(await canViewTeamThread(viewer, threadId))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId") || "";
  const denied = await requireThread(viewer, threadId);
  if (denied) return denied;

  const [polls, events, files, tasks, calls, pins] = await Promise.all([
    glashQuery(`select * from public.team_chat_polls where thread_id = $1 order by created_at desc limit 25`, [threadId]),
    glashQuery(`select * from public.team_chat_events where thread_id = $1 order by starts_at asc limit 25`, [threadId]),
    glashQuery(`select * from public.team_chat_files where thread_id = $1 order by created_at desc limit 50`, [threadId]),
    glashQuery(`select * from public.team_chat_tasks where thread_id = $1 order by due_date asc nulls last, created_at desc limit 50`, [threadId]),
    glashQuery(`select * from public.team_chat_call_sessions where thread_id = $1 order by created_at desc limit 25`, [threadId]),
    glashQuery(
      `select p.*, m.body, m.attachment_url, m.created_at as message_created_at
       from public.team_chat_pins p
       join public.team_chat_messages m on m.id = p.message_id
       where p.thread_id = $1
       order by p.pinned_at desc
       limit 25`,
      [threadId],
    ),
  ]);

  return NextResponse.json({ ok: true, collaboration: { polls, events, files, tasks, calls, pins } });
}

export async function POST(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const threadId = String(body?.threadId || "");
  const kind = String(body?.kind || "");
  const denied = await requireThread(viewer, threadId);
  if (denied) return denied;

  const actor = getViewerReactionKey(viewer);
  try {
    let row: any = null;
    if (kind === "poll") {
      const question = String(body?.question || "").trim();
      const options = Array.isArray(body?.options) ? body.options : [];
      if (!question || options.length < 2) {
        return NextResponse.json({ ok: false, error: "Poll requires a question and at least two options" }, { status: 400 });
      }
      row = (
        await glashQuery(
          `insert into public.team_chat_polls (thread_id, question, options, settings, closes_at, created_by)
           values ($1, $2, $3::jsonb, $4::jsonb, $5::timestamptz, $6)
           returning *`,
          [
            threadId,
            question,
            JSON.stringify(options),
            JSON.stringify(body?.settings && typeof body.settings === "object" ? body.settings : {}),
            body?.closesAt || null,
            actor,
          ],
        )
      )[0];
    } else if (kind === "event") {
      const title = String(body?.title || "").trim();
      if (!title || !body?.startsAt) {
        return NextResponse.json({ ok: false, error: "Event requires title and startsAt" }, { status: 400 });
      }
      row = (
        await glashQuery(
          `insert into public.team_chat_events
            (thread_id, title, description, starts_at, ends_at, location, meeting_url, created_by)
           values ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8)
           returning *`,
          [threadId, title, body?.description || null, body.startsAt, body?.endsAt || null, body?.location || null, body?.meetingUrl || null, actor],
        )
      )[0];
    } else if (kind === "task") {
      const title = String(body?.title || "").trim();
      if (!title) return NextResponse.json({ ok: false, error: "Task title required" }, { status: 400 });
      row = (
        await glashQuery(
          `insert into public.team_chat_tasks
            (thread_id, project_id, source_message_id, title, description, status, priority, assignee_id, due_date, recurrence_rule, dependency_task_id, progress, created_by)
           values ($1,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::uuid,$9::date,$10,$11::uuid,$12,$13)
           returning *`,
          [
            threadId,
            body?.projectId || null,
            body?.sourceMessageId || null,
            title,
            body?.description || null,
            body?.status || "not_started",
            body?.priority || "medium",
            body?.assigneeId || null,
            body?.dueDate || null,
            body?.recurrenceRule || null,
            body?.dependencyTaskId || null,
            Number.isFinite(Number(body?.progress)) ? Number(body.progress) : 0,
            actor,
          ],
        )
      )[0];
    } else if (kind === "file") {
      // Files may only be shared in group spaces - block in member↔member DMs.
      if (await isAttachmentRestrictedThread(threadId)) {
        return NextResponse.json(
          { ok: false, error: "Sharing files isn't allowed in direct chats - use your department or project group chat." },
          { status: 403 },
        );
      }
      const metadata = {
        resourceType: body?.invoiceId ? "invoice" : body?.projectId ? "project" : null,
        resourceId: body?.invoiceId || body?.projectId || null,
      };
      const protectedShare = await canShareProtectedChatResource(viewer, threadId, metadata);
      if (!protectedShare.ok) return NextResponse.json({ ok: false, error: protectedShare.error }, { status: 403 });
      if (!body?.fileUrl) return NextResponse.json({ ok: false, error: "fileUrl required" }, { status: 400 });
      row = (
        await glashQuery(
          `insert into public.team_chat_files
            (thread_id, message_id, project_id, invoice_id, file_url, file_name, mime_type, file_size_bytes, folder, version, approval_status, permissions, uploaded_by)
           values ($1,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::bigint,$9,coalesce($10::integer,1),$11,$12::jsonb,$13)
           returning *`,
          [
            threadId,
            body?.messageId || null,
            body?.projectId || null,
            body?.invoiceId || null,
            body.fileUrl,
            body?.fileName || null,
            body?.mimeType || null,
            Number.isFinite(Number(body?.fileSizeBytes)) ? Number(body.fileSizeBytes) : null,
            body?.folder || null,
            Number.isFinite(Number(body?.version)) ? Number(body.version) : 1,
            body?.approvalStatus || "draft",
            JSON.stringify(body?.permissions && typeof body.permissions === "object" ? body.permissions : {}),
            actor,
          ],
        )
      )[0];
    } else if (kind === "ai_artifact") {
      row = (
        await glashQuery(
          `insert into public.team_chat_ai_artifacts
            (thread_id, artifact_type, title, summary, payload, created_by)
           values ($1,$2,$3,$4,$5::jsonb,$6)
           returning *`,
          [
            threadId,
            body?.artifactType || "summary",
            body?.title || null,
            body?.summary || null,
            JSON.stringify(body?.payload && typeof body.payload === "object" ? body.payload : {}),
            actor,
          ],
        )
      )[0];
    } else {
      return NextResponse.json({ ok: false, error: "Unsupported collaboration kind" }, { status: 400 });
    }

    await glashQuery(
      `insert into public.team_chat_audit_logs
        (actor_key, actor_kind, action, resource_type, resource_id, thread_id, metadata)
       values ($1, $2, $3, $4, $5, $6, '{}'::jsonb)`,
      [actor, viewer.kind, `chat.${kind}.create`, `team_chat_${kind}`, row?.id || null, threadId],
    );

    return NextResponse.json({ ok: true, item: row });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Collaboration action failed" },
      { status: 500 },
    );
  }
}

// PATCH - interact with existing collaboration items: vote on a poll, or move a
// task's status. Votes are stored inside the poll's `settings.votes` JSON as
// { viewerKey: optionIndex } so no schema change is needed.
export async function PATCH(req: Request) {
  const viewer = await getChatViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const threadId = String(body?.threadId || "");
  const action = String(body?.action || "");
  const denied = await requireThread(viewer, threadId);
  if (denied) return denied;

  const actor = getViewerReactionKey(viewer);
  try {
    if (action === "vote_poll") {
      const pollId = String(body?.pollId || "");
      const optionIndex = Number(body?.optionIndex);
      if (!pollId || !Number.isInteger(optionIndex)) {
        return NextResponse.json({ ok: false, error: "pollId and optionIndex required" }, { status: 400 });
      }
      const poll = (
        await glashQuery<any>(`select * from public.team_chat_polls where id = $1 and thread_id = $2`, [pollId, threadId])
      )[0];
      if (!poll) return NextResponse.json({ ok: false, error: "Poll not found" }, { status: 404 });
      const options = Array.isArray(poll.options) ? poll.options : [];
      if (optionIndex < 0 || optionIndex >= options.length) {
        return NextResponse.json({ ok: false, error: "Invalid option" }, { status: 400 });
      }
      const settings = poll.settings && typeof poll.settings === "object" ? { ...poll.settings } : {};
      const votes = settings.votes && typeof settings.votes === "object" ? { ...settings.votes } : {};
      // Re-voting the same option clears your vote (toggle).
      if (votes[actor] === optionIndex) delete votes[actor];
      else votes[actor] = optionIndex;
      settings.votes = votes;
      const updated = (
        await glashQuery<any>(`update public.team_chat_polls set settings = $1::jsonb where id = $2 returning *`, [
          JSON.stringify(settings),
          pollId,
        ])
      )[0];
      return NextResponse.json({ ok: true, item: updated });
    }

    if (action === "toggle_task") {
      const taskId = String(body?.taskId || "");
      const status = String(body?.status || "");
      const allowed = ["not_started", "in_progress", "completed"];
      if (!taskId || !allowed.includes(status)) {
        return NextResponse.json({ ok: false, error: "taskId and a valid status are required" }, { status: 400 });
      }
      const progress = status === "completed" ? 100 : status === "in_progress" ? 50 : 0;
      const updated = (
        await glashQuery<any>(
          `update public.team_chat_tasks set status = $1, progress = $2 where id = $3 and thread_id = $4 returning *`,
          [status, progress, taskId, threadId],
        )
      )[0];
      if (!updated) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
      return NextResponse.json({ ok: true, item: updated });
    }

    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Collaboration action failed" },
      { status: 500 },
    );
  }
}
