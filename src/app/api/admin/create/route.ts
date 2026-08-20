import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { loadCreateAdminData, upsertCreateTool } from "@/lib/create-platform/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "create.view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await loadCreateAdminData();
  return NextResponse.json({ ok: true, data });
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
