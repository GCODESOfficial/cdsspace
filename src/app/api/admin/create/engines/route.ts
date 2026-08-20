import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import {
  loadEngineStates, listEngineRoutes, updateEngine, updateEngineRoute,
  listTrainingSamples, addTrainingSample, deleteTrainingSample,
} from "@/lib/create-platform/engines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "create.view");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [engines, routes, training] = await Promise.all([loadEngineStates(), listEngineRoutes(), listTrainingSamples()]);
  return NextResponse.json({ ok: true, engines, routes, training });
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, "create.manage_tools");
  if (denied || !session) return denied || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const email = typeof session === "object" && session && "email" in session ? String((session as { email?: string }).email || "") : "";

  try {
    if (action === "update_engine") {
      const ok = await updateEngine(String(body.key || ""), {
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        dailyBudgetCents: typeof body.dailyBudgetCents === "number" ? body.dailyBudgetCents : undefined,
        costPerCallCents: typeof body.costPerCallCents === "number" ? body.costPerCallCents : undefined,
        licenseAttested: typeof body.licenseAttested === "boolean" ? body.licenseAttested : undefined,
        config: body.config && typeof body.config === "object" ? body.config as Record<string, unknown> : undefined,
      });
      return NextResponse.json({ ok });
    }
    if (action === "update_route") {
      const ok = await updateEngineRoute(
        String(body.toolSlug || ""),
        String(body.primaryEngine || ""),
        Array.isArray(body.fallbackEngines) ? body.fallbackEngines.map(String) : [],
      );
      return NextResponse.json({ ok });
    }
    if (action === "add_training") {
      const ok = await addTrainingSample({
        engine: typeof body.engine === "string" ? body.engine : "internal",
        capability: String(body.capability || ""),
        label: typeof body.label === "string" ? body.label : "",
        prompt: typeof body.prompt === "string" ? body.prompt : "",
        assetRef: typeof body.assetRef === "string" ? body.assetRef : "",
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        createdBy: email,
      });
      return NextResponse.json({ ok });
    }
    if (action === "delete_training") {
      const ok = await deleteTrainingSample(String(body.id || ""));
      return NextResponse.json({ ok });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed." }, { status: 400 });
  }
}
