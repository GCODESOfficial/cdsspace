import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdminSession } from "@/app/api/admin-check/route";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getAdminSession(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const allowed = ["status", "notes", "scheduled_at"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = getSupabaseAdmin();
  const { data, error } = await sb.from("consultation_requests").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ consultation: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!getAdminSession(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = getSupabaseAdmin();
  const { error } = await sb.from("consultation_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
