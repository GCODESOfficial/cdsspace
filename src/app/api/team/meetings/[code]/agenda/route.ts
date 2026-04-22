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
    .from("team_meeting_agenda_items")
    .select("*")
    .eq("meeting_id", id)
    .order("position", { ascending: true });
  return NextResponse.json({ ok: true, items: data || [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { code } = await params;
  const id = await resolveMeetingId(code);
  if (!id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { title, duration_minutes, presenter_id } = await req.json().catch(() => ({}));
  if (!title?.trim()) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

  const db = supabaseAdmin as any;
  // next position = current max + 1
  const { data: max } = await db
    .from("team_meeting_agenda_items")
    .select("position")
    .eq("meeting_id", id)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = ((max?.[0]?.position as number) ?? -1) + 1;

  const { data, error } = await db
    .from("team_meeting_agenda_items")
    .insert({
      meeting_id: id,
      title: title.trim(),
      duration_minutes: duration_minutes || null,
      presenter_id: presenter_id || null,
      position: nextPos,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
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
    .from("team_meeting_agenda_items")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  const admin = await getAdminSession();
  const team = admin ? null : await getTeamSession();
  if (!admin && !team) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const db = supabaseAdmin as any;
  const { error } = await db.from("team_meeting_agenda_items").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
