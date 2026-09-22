import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { createLetterhead, listLetterheads } from "@/lib/create-platform/letterheads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actorOrResponse(request: Request) {
  const actor = await getCreateActorFromRequest(request);
  if (!actor) return { response: NextResponse.json({ error: "Sign in to use Create." }, { status: 401 }) } as const;
  if (actor.accessLocked) return { response: NextResponse.json({ error: "Create is not available on client accounts yet." }, { status: 403 }) } as const;
  return { actor } as const;
}

export async function GET(request: NextRequest) {
  const auth = await actorOrResponse(request);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(
      { ok: true, letterheads: await listLetterheads(auth.actor) },
      { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Letterheads could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await actorOrResponse(request);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({ ok: true, letterhead: await createLetterhead(auth.actor) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The letterhead draft could not be created." }, { status: 500 });
  }
}
