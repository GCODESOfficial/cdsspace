import { NextRequest, NextResponse } from "next/server";
import { createActorHasAdminPermission, getCreateActorFromRequest, type CreateActor } from "@/lib/create-platform/session";
import { archiveLetterhead, getLetterhead, markLetterheadExported, updateLetterhead } from "@/lib/create-platform/letterheads";
import type { LetterheadScope } from "@/lib/create-platform/letterheads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function actorAndId(request: Request, params: Promise<{ id: string }>) {
  const actor = await getCreateActorFromRequest(request);
  const { id } = await params;
  if (!actor) return { response: NextResponse.json({ error: "Sign in to use Create." }, { status: 401 }) } as const;
  if (actor.accessLocked) return { response: NextResponse.json({ error: "Create is not available on client accounts yet." }, { status: 403 }) } as const;
  if (!UUID.test(id)) return { response: NextResponse.json({ error: "Invalid letterhead ID." }, { status: 400 }) } as const;
  return { actor, id } as const;
}

function executivePermissionResponse(actor: CreateActor, scope: LetterheadScope, permission: "view" | "manage") {
  if (scope !== "executive_board") return null;
  const allowed = createActorHasAdminPermission(
    actor,
    permission === "manage" ? "executive_board.letterhead_manage" : "executive_board.letterhead_view",
  );
  return allowed ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await actorAndId(req, params);
  if ("response" in auth) return auth.response;
  const letterhead = await getLetterhead(auth.actor, auth.id);
  if (!letterhead) return NextResponse.json({ error: "Letterhead not found." }, { status: 404 });
  const denied = executivePermissionResponse(auth.actor, letterhead.scope, "view");
  if (denied) return denied;
  return NextResponse.json(
    { ok: true, letterhead },
    { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } },
  );
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await actorAndId(req, params);
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const current = await getLetterhead(auth.actor, auth.id);
    if (!current) return NextResponse.json({ error: "Letterhead not found." }, { status: 404 });
    const denied = executivePermissionResponse(auth.actor, current.scope, "manage");
    if (denied) return denied;
    return NextResponse.json({ ok: true, letterhead: await updateLetterhead(auth.actor, auth.id, body, current.scope) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The letterhead could not be saved." }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await actorAndId(req, params);
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (body.action !== "exported") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  const current = await getLetterhead(auth.actor, auth.id);
  if (!current) return NextResponse.json({ error: "Letterhead not found." }, { status: 404 });
  const denied = executivePermissionResponse(auth.actor, current.scope, "view");
  if (denied) return denied;
  await markLetterheadExported(auth.actor, auth.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await actorAndId(req, params);
  if ("response" in auth) return auth.response;
  const current = await getLetterhead(auth.actor, auth.id);
  if (!current) return NextResponse.json({ error: "Letterhead not found." }, { status: 404 });
  const denied = executivePermissionResponse(auth.actor, current.scope, "manage");
  if (denied) return denied;
  await archiveLetterhead(auth.actor, auth.id);
  return NextResponse.json({ ok: true });
}
