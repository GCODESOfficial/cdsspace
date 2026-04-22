/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTeamSession } from "@/lib/team-auth";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

async function resolveMeetingId(code: string) {
  if (!supabaseAdmin) return null;
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("team_meetings")
    .select("id")
    .eq("room_code", code.toUpperCase())
    .maybeSingle();
  return data?.id as string | undefined;
}

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const { code } = await params;
  const id = await resolveMeetingId(code);
  if (!id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("team_meeting_notes")
    .select("*")
    .eq("meeting_id", id)
    .order("created_at", { ascending: true });
  return NextResponse.json({ ok: true, notes: data || [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { code } = await params;
  const id = await resolveMeetingId(code);
  if (!id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { body, kind, assignee_id, due_date } = await req.json().catch(() => ({}));
  if (!body?.trim()) return NextResponse.json({ ok: false, error: "Body is required" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("team_meeting_notes")
    .insert({
      meeting_id: id,
      body: body.trim(),
      kind: kind || "note",
      assignee_id: assignee_id || null,
      due_date: due_date || null,
      author_id: team?.id || null,
      author_is_admin: !!admin,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, note: data });
}

export async function PATCH(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id, completed } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { error } = await db
    .from("team_meeting_notes")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
