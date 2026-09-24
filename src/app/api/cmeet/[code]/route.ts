/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getToolActor } from "@/lib/team-tools-auth";
import { closeStaleCmeets } from "@/lib/cmeet-autoclose";
import { getClientAccountState } from "@/lib/client-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!code || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  await closeStaleCmeets();
  const actor = await getToolActor();
  const account = actor ? null : await getClientAccountState().catch(() => null);
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("team_meetings")
    .select("id, room_code, title, agenda, audio_only, created_by, created_by_admin, created_by_client, started_at, ended_at, scheduled_for, status, approval_status, approval_requested_at, approved_at")
    .eq("room_code", code)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const canEndStream = actor?.kind === "admin"
    || (actor?.kind === "team" && data.created_by === actor.id)
    || Boolean(account?.user?.id && data.created_by_client === account.user.id);
  const viewer = actor?.kind === "admin"
    ? {
        id: actor.memberId,
        name: actor.name,
        kind: "admin" as const,
        avatar_url: "/favicon.png",
        is_super_admin: actor.role === "super_admin",
      }
    : actor?.kind === "team"
      ? {
          id: actor.id,
          name: actor.name,
          kind: "team" as const,
          avatar_url: actor.avatarUrl,
          is_super_admin: false,
        }
      : account
        ? {
            id: account.user.id,
            name: account.profile.full_name || account.profile.company_name || account.profile.email || "Client",
            kind: "client" as const,
            avatar_url: account.profile.avatar_url,
            is_super_admin: false,
          }
        : null;
  return NextResponse.json({
    ok: true,
    meeting: {
      ...data,
      created_by: actor || account ? data.created_by : null,
      can_end_stream: canEndStream,
      can_approve: actor?.kind === "admin" && data.approval_status === "pending",
    },
    is_guest_view: !actor && !account,
    viewer,
    return_to: actor?.kind === "admin" ? "/admin/cmeet" : actor?.kind === "team" ? "/team/cmeet" : account ? "/dashboard/cmeet" : "/login",
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = await req.json().catch(() => null) as { audioOnly?: unknown } | null;
  if (!body || typeof body.audioOnly !== "boolean") {
    return NextResponse.json({ ok: false, error: "Choose audio or video mode." }, { status: 400 });
  }
  const actor = await getToolActor();
  const account = actor ? null : await getClientAccountState().catch(() => null);
  if ((!actor && !account) || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin as any;
  const { data: meeting } = await db
    .from("team_meetings")
    .select("id, created_by, created_by_client, status")
    .eq("room_code", code)
    .maybeSingle();
  if (!meeting) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (meeting.status === "ended" || meeting.status === "cancelled") {
    return NextResponse.json({ ok: false, error: "This meeting has ended." }, { status: 410 });
  }
  const actorMemberId = actor?.kind === "team" ? actor.id : actor?.memberId || null;
  const mayChangeMode = (actor?.kind === "admin" && actor.role === "super_admin")
    || Boolean(actorMemberId && meeting.created_by === actorMemberId)
    || Boolean(account?.user?.id && meeting.created_by_client === account.user.id);
  if (!mayChangeMode) {
    return NextResponse.json({ ok: false, error: "Only the meeting host can change the call mode." }, { status: 403 });
  }
  const { error } = await db
    .from("team_meetings")
    .update({ audio_only: body.audioOnly, last_active_at: new Date().toISOString() })
    .eq("id", meeting.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, audioOnly: body.audioOnly });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const actor = await getToolActor();
  const account = actor ? null : await getClientAccountState().catch(() => null);
  if ((!actor && !account) || !supabaseAdmin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin as any;
  const { data: m } = await db.from("team_meetings").select("id, created_by, created_by_client").eq("room_code", code).maybeSingle();
  if (!m) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const mayEnd = actor?.kind === "admin"
    || (actor?.kind === "team" && m.created_by === actor.id)
    || Boolean(account?.user?.id && m.created_by_client === account.user.id);
  if (!mayEnd) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  await db.from("team_meetings").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", m.id);
  return NextResponse.json({ ok: true });
}
