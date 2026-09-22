import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { getCreateTool, toggleCreateFavorite } from "@/lib/create-platform/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const actor = await getCreateActorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use CREATE." }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const toolSlug = typeof body.toolSlug === "string" ? body.toolSlug.trim() : "";
  const favorite = body.favorite === true;
  if (!/^[a-z0-9-]{1,80}$/.test(toolSlug)) {
    return NextResponse.json({ error: "CREATE tool not found." }, { status: 404 });
  }
  const tool = await getCreateTool(toolSlug);
  if (!tool) return NextResponse.json({ error: "CREATE tool not found." }, { status: 404 });
  try {
    const value = await toggleCreateFavorite(actor, tool.slug, favorite);
    return NextResponse.json({ ok: true, favorite: value });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update favourite." }, { status: 400 });
  }
}
