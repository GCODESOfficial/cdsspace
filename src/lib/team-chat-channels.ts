/**
 * Team-chat channel automation (Phase 1).
 *
 * Keeps a chat room in lockstep with the structures it mirrors:
 *   - every finance project gets one "Project Chat" room (kind=group, the
 *     project_id FK links them), and
 *   - everyone assigned to the project (directly or via their department) is a
 *     participant.
 *
 * All functions are best-effort and idempotent: callers should not let a chat
 * hiccup fail the project/assignment operation that triggered it.
 */
import { glashQuery, glashMaybeOne, glashOne } from "@/lib/glashdb/postgres";

/**
 * Insert every active member assigned to a project (direct + department) as a
 * participant of the given thread. No-op on conflicts.
 */
async function seedProjectMembers(threadId: string, projectId: string): Promise<void> {
  await glashQuery(
    `insert into public.team_chat_participants (thread_id, team_member_id)
     with direct_members as (
       select pa.team_member_id as id
         from public.project_assignments pa
         join public.team_members m on m.id = pa.team_member_id and m.is_active = true
        where pa.project_id = $2 and pa.team_member_id is not null
     ),
     department_members as (
       -- Primary-department name match OR any of the member's departments (junction).
       select m.id
         from public.project_assignments pa
         join public.team_members m on m.is_active = true
        where pa.project_id = $2 and pa.department is not null
          and (
            lower(m.department) = lower(pa.department)
            or exists (
              select 1 from public.team_member_departments tmd
                join public.departments d on d.id = tmd.department_id
               where tmd.team_member_id = m.id and lower(d.name) = lower(pa.department)
            )
          )
     )
     select $1::uuid, r.id
       from (select id from direct_members union select id from department_members) r
      where r.id is not null
     on conflict (thread_id, team_member_id) do nothing`,
    [threadId, projectId],
  );
}

/**
 * Return the chat thread id for a project, creating the room (and seeding its
 * members) the first time. Reuses the existing room on subsequent calls.
 */
export async function ensureProjectChannel(projectId: string): Promise<string | null> {
  if (!projectId) return null;
  try {
    const existing = await glashMaybeOne<{ id: string }>(
      `select id from public.team_chat_threads where project_id = $1 limit 1`,
      [projectId],
    );
    if (existing) {
      await seedProjectMembers(existing.id, projectId);
      return existing.id;
    }

    const project = await glashMaybeOne<{ name: string | null }>(
      `select name from public.finance_projects where id = $1 limit 1`,
      [projectId],
    );
    const name = `${project?.name ?? "Project"} - Project Chat`;

    const thread = await glashOne<{ id: string }>(
      `insert into public.team_chat_threads (kind, name, project_id, includes_admin, last_message_at, updated_at)
       values ('group', $1, $2, true, now(), now())
       returning id`,
      [name, projectId],
    );
    await seedProjectMembers(thread.id, projectId);
    return thread.id;
  } catch (err) {
    console.error("[team-chat-channels] ensureProjectChannel failed:", err);
    return null;
  }
}

/** Ensure the room exists, then (re)sync all assigned members into it. */
export async function syncProjectChannelMembers(projectId: string): Promise<void> {
  const threadId = await ensureProjectChannel(projectId);
  if (!threadId) return;
  try {
    await seedProjectMembers(threadId, projectId);
  } catch (err) {
    console.error("[team-chat-channels] syncProjectChannelMembers failed:", err);
  }
}
