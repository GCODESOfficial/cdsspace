/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdminSession } from "@/lib/admin-session";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";

// Canonical resolver: admin_session cookie OR sub-admin team_session.
async function verifyAdmin() {
  return getAdminSession();
}

// GET - list departments with member + message counts
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin as any;
  const { data: deps, error } = await db
    .from("departments")
    .select("id, name, description, thread_id, created_at")
    .order("name");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Hydrate member counts from the many-to-many junction. Falls back to the
  // legacy department_id count if the junction migration hasn't been applied.
  const depIds = (deps || []).map((d: any) => d.id);
  const counts: Record<string, number> = {};
  if (depIds.length) {
    try {
      const rows = await glashQuery<{ department_id: string; n: number }>(
        `select department_id, count(*)::int as n
           from public.team_member_departments
          where department_id = any($1::uuid[])
          group by department_id`,
        [depIds],
      );
      rows.forEach((r) => { counts[r.department_id] = r.n; });
    } catch {
      const { data: members } = await db
        .from("team_members")
        .select("department_id")
        .in("department_id", depIds);
      (members || []).forEach((m: any) => {
        counts[m.department_id] = (counts[m.department_id] || 0) + 1;
      });
    }
  }

  return NextResponse.json({
    ok: true,
    departments: (deps || []).map((d: any) => ({ ...d, member_count: counts[d.id] || 0 })),
  });
}

// POST - create a department + auto-create its team chat thread
export async function POST(req: Request) {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, description, member_ids } = body;
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    return NextResponse.json({ ok: false, error: "Name is required" }, { status: 400 });
  }

  const db = supabaseAdmin as any;

  // Create the department
  const { data: dep, error: depErr } = await db
    .from("departments")
    .insert({ name: cleanName, description: description || null })
    .select("id, name")
    .single();
  if (depErr) {
    if (String(depErr.message).toLowerCase().includes("duplicate")) {
      return NextResponse.json({ ok: false, error: "A department with that name already exists." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: depErr.message }, { status: 500 });
  }

  // Auto-create the department chat thread
  const { data: thread, error: threadErr } = await db
    .from("team_chat_threads")
    .insert({ kind: "department", name: dep.name, department: dep.name, includes_admin: true })
    .select("id")
    .single();
  if (threadErr) {
    return NextResponse.json({ ok: false, error: threadErr.message }, { status: 500 });
  }

  await db.from("departments").update({ thread_id: thread.id }).eq("id", dep.id);

  // Optionally seed members now — via the junction (additive), plus set their
  // primary department if unset, and add them to the new chat channel.
  if (Array.isArray(member_ids) && member_ids.length) {
    const ids = member_ids.map(String);
    await glashQuery(
      `insert into public.team_member_departments (team_member_id, department_id)
       select unnest($1::uuid[]), $2::uuid
       on conflict (team_member_id, department_id) do nothing`,
      [ids, dep.id],
    );
    await glashQuery(
      `update public.team_members set department_id = $2, department = $3
        where id = any($1::uuid[]) and department_id is null`,
      [ids, dep.id, dep.name],
    );
    await glashQuery(
      `insert into public.team_chat_participants (thread_id, team_member_id, role)
       select $1::uuid, unnest($2::uuid[]), 'member'
       on conflict (thread_id, team_member_id) do nothing`,
      [thread.id, ids],
    );
  }

  return NextResponse.json({ ok: true, department: { ...dep, thread_id: thread.id } });
}

// PATCH - rename / update description
export async function PATCH(req: Request) {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id, name, description } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const db = supabaseAdmin as any;
  const patch: Record<string, any> = {};
  if (name) patch.name = String(name).trim();
  if (description !== undefined) patch.description = description || null;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  const { data: dep, error } = await db.from("departments").update(patch).eq("id", id).select("id, name, thread_id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Keep the thread name + legacy TEXT on members in sync
  if (dep.thread_id && patch.name) {
    await db.from("team_chat_threads").update({ name: patch.name, department: patch.name }).eq("id", dep.thread_id);
    await db.from("team_members").update({ department: patch.name }).eq("department_id", id);
  }
  return NextResponse.json({ ok: true });
}

// DELETE - remove a department. Unlinks members (department_id → null) and
// deletes the chat thread (cascades participants + messages).
export async function DELETE(req: Request) {
  const admin = await verifyAdmin();
  if (!admin || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { data: dep } = await db.from("departments").select("thread_id").eq("id", id).maybeSingle();

  if (dep?.thread_id) {
    await db.from("team_chat_threads").delete().eq("id", dep.thread_id);
  }
  await db.from("team_members").update({ department_id: null, department: null }).eq("department_id", id);
  const { error } = await db.from("departments").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
