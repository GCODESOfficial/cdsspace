/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { glashQuery, glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";

// Canonical resolver: admin_session cookie OR sub-admin team_session.
async function verifyAdmin() {
  return getAdminSession();
}

/**
 * Join members to a department. Membership is many-to-many via
 * team_member_departments — adding a member here does NOT remove them from any
 * other department. We also: (a) set the member's "primary" department if they
 * had none, and (b) add them to the department's chat channel.
 */
async function joinDepartment(depId: string, threadId: string | null, depName: string, memberIds: string[]) {
  await glashQuery(
    `insert into public.team_member_departments (team_member_id, department_id)
     select unnest($1::uuid[]), $2::uuid
     on conflict (team_member_id, department_id) do nothing`,
    [memberIds, depId],
  );
  // Give members with no primary department this one (for legacy single-dept features).
  await glashQuery(
    `update public.team_members set department_id = $2, department = $3
      where id = any($1::uuid[]) and department_id is null`,
    [memberIds, depId, depName],
  );
  // Add them to the department chat channel (idempotent).
  if (threadId) {
    await glashQuery(
      `insert into public.team_chat_participants (thread_id, team_member_id, role)
       select $1::uuid, unnest($2::uuid[]), 'member'
       on conflict (thread_id, team_member_id) do nothing`,
      [threadId, memberIds],
    );
  }
}

// GET - list members of a department (via the junction)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let members: any[];
  try {
    members = await glashQuery<any>(
      `select m.id, m.full_name, m.email, m.username, m.role_title, m.avatar_url, m.is_active
         from public.team_member_departments tmd
         join public.team_members m on m.id = tmd.team_member_id
        where tmd.department_id = $1
        order by m.full_name`,
      [id],
    );
  } catch {
    // Junction migration not applied yet — fall back to the single-department column.
    members = await glashQuery<any>(
      `select id, full_name, email, username, role_title, avatar_url, is_active
         from public.team_members where department_id = $1 order by full_name`,
      [id],
    );
  }
  return NextResponse.json({ ok: true, members });
}

// POST - join members to this department (additive; keeps other memberships)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { member_ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    return NextResponse.json({ ok: false, error: "member_ids required" }, { status: 400 });
  }
  const dep = await glashMaybeOne<{ name: string; thread_id: string | null }>(
    `select name, thread_id from public.departments where id = $1`,
    [id],
  );
  if (!dep) return NextResponse.json({ ok: false, error: "Department not found" }, { status: 404 });

  try {
    await joinDepartment(id, dep.thread_id, dep.name, member_ids.map(String));
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to add members" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

// DELETE - remove members from THIS department only (body: { member_ids: [] })
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { member_ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    return NextResponse.json({ ok: false, error: "member_ids required" }, { status: 400 });
  }
  const ids = member_ids.map(String);
  const dep = await glashMaybeOne<{ thread_id: string | null }>(
    `select thread_id from public.departments where id = $1`,
    [id],
  );
  try {
    // Drop just this department's membership.
    await glashQuery(
      `delete from public.team_member_departments where department_id = $1 and team_member_id = any($2::uuid[])`,
      [id, ids],
    );
    // Remove from this department's chat channel.
    if (dep?.thread_id) {
      await glashQuery(
        `delete from public.team_chat_participants where thread_id = $1 and team_member_id = any($2::uuid[])`,
        [dep.thread_id, ids],
      );
    }
    // If this was their primary department, repoint it to any remaining one (or null).
    await glashQuery(
      `update public.team_members m
          set department_id = t.dep_id, department = t.dep_name
         from (
           select mm.id,
                  tmd.department_id as dep_id,
                  d.name as dep_name
             from public.team_members mm
             left join lateral (
               select department_id from public.team_member_departments
                where team_member_id = mm.id limit 1
             ) tmd on true
             left join public.departments d on d.id = tmd.department_id
            where mm.id = any($1::uuid[]) and mm.department_id = $2
         ) t
        where m.id = t.id`,
      [ids, id],
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to remove members" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
