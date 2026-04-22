/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

async function verifyAdmin() {
  const store = await cookies();
  const raw = store.get("admin_session")?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s.role === "super_admin" || s.role === "sub_admin" ? s : null;
  } catch {
    return null;
  }
}

// GET — list departments with member + message counts
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

  // Hydrate counts
  const depIds = (deps || []).map((d: any) => d.id);
  const counts: Record<string, number> = {};
  if (depIds.length) {
    const { data: members } = await db
      .from("team_members")
      .select("department_id")
      .in("department_id", depIds);
    (members || []).forEach((m: any) => {
      counts[m.department_id] = (counts[m.department_id] || 0) + 1;
    });
  }

  return NextResponse.json({
    ok: true,
    departments: (deps || []).map((d: any) => ({ ...d, member_count: counts[d.id] || 0 })),
  });
}

// POST — create a department + auto-create its team chat thread
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

  // Optionally seed members now. The DB trigger will also attach them to the thread.
  if (Array.isArray(member_ids) && member_ids.length) {
    await db.from("team_members").update({ department_id: dep.id, department: dep.name }).in("id", member_ids);
  }

  return NextResponse.json({ ok: true, department: { ...dep, thread_id: thread.id } });
}

// PATCH — rename / update description
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

// DELETE — remove a department. Unlinks members (department_id → null) and
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
