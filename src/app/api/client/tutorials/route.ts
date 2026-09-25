import { NextRequest, NextResponse } from "next/server";
import { getCreateActor } from "@/lib/create-platform/session";
import { glashQuery } from "@/lib/glashdb/postgres";
import { listClientTutorials } from "@/lib/tutorials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await getCreateActor("client");
  if (!actor) return NextResponse.json({ error: "Sign in to view tutorials." }, { status: 401 });
  const tool = new URL(request.url).searchParams.get("tool");
  return NextResponse.json({ ok: true, tutorials: await listClientTutorials(actor.id, tool) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const actor = await getCreateActor("client");
  if (!actor) return NextResponse.json({ error: "Sign in to update tutorial progress." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const tutorialId = String(body.tutorialId || "");
  const position = Math.min(86400, Math.max(0, Number(body.positionSeconds) || 0));
  const completed = Boolean(body.completed);
  await glashQuery(
    `insert into public.client_tutorial_progress
      (client_user_id, tutorial_id, opened_at, completed_at, last_position_seconds)
     select $1::uuid, id, now(), case when $3 then now() else null end, $4
       from public.dashboard_tutorials where id=$2::uuid and status='published' and deleted_at is null
     on conflict (client_user_id, tutorial_id) do update set
       opened_at=coalesce(client_tutorial_progress.opened_at, now()),
       completed_at=case when $3 then coalesce(client_tutorial_progress.completed_at, now()) else client_tutorial_progress.completed_at end,
       last_position_seconds=$4, updated_at=now()`,
    [actor.id, tutorialId, completed, position],
  );
  return NextResponse.json({ ok: true });
}
