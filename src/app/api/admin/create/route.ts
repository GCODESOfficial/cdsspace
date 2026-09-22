import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { loadCreateAdminData, updateCreateToolStatus, upsertCreateTool } from "@/lib/create-platform/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "create.view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await loadCreateAdminData();
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Create settings." },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "create.manage_tools");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const tool = await upsertCreateTool(body);
    return NextResponse.json({ ok: true, tool });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save CREATE tool." }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "create.manage_tools");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const tool = await updateCreateToolStatus(body.slug, body.status);
    return NextResponse.json(
      { ok: true, tool },
      { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the Create tool status." },
      { status: 400 },
    );
  }
}
