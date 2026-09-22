import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { createCreateProject } from "@/lib/create-platform/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const actor = await getCreateActorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use CREATE." }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const project = await createCreateProject(actor, {
      name: typeof body.name === "string" ? body.name.slice(0, 120) : "",
      description: typeof body.description === "string" ? body.description.slice(0, 2000) : "",
      color: typeof body.color === "string" ? body.color.slice(0, 20) : "",
    });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create project." }, { status: 400 });
  }
}
