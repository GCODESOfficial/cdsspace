import { NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { duplicateLetterhead } from "@/lib/create-platform/letterheads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  const { id } = await params;
  if (!actor) return NextResponse.json({ error: "Sign in to use Create." }, { status: 401 });
  if (actor.accessLocked) return NextResponse.json({ error: "Create is not available on client accounts yet." }, { status: 403 });
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid letterhead ID." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, letterhead: await duplicateLetterhead(actor, id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The letterhead could not be duplicated." }, { status: 400 });
  }
}
