import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { deleteCreateCreation, duplicateCreateCreation, listCreateCreations } from "@/lib/create-platform/server";
import { CLIENT_STORAGE_FULL_CODE, isClientStorageFullError } from "@/lib/client-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight poll used by the UI to refresh processing creations.
export async function GET(req: NextRequest) {
  const actor = await getCreateActorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use CREATE." }, { status: 401 });
  const creations = await listCreateCreations(actor);
  return NextResponse.json(
    { ok: true, creations },
    { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } },
  );
}

export async function POST(req: NextRequest) {
  const actor = await getCreateActorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use CREATE." }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  // Accepts a single `id` or a batch of `ids` so the UI can run bulk actions.
  const raw = Array.isArray(body.ids) ? body.ids : [body.id];
  const ids = raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v && v.length <= 100);
  if (!ids.length) return NextResponse.json({ error: "Missing creation." }, { status: 400 });
  if (ids.length > 100) return NextResponse.json({ error: "Too many creations in one request." }, { status: 400 });
  const batch = Array.isArray(body.ids);
  try {
    if (action === "duplicate") {
      const creations = [];
      for (const id of ids) creations.push(await duplicateCreateCreation(actor, id));
      return batch
        ? NextResponse.json({ ok: true, creations })
        : NextResponse.json({ ok: true, creation: creations[0] });
    }
    if (action === "delete") {
      for (const id of ids) await deleteCreateCreation(actor, id);
      return NextResponse.json({ ok: true, deleted: ids.length });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const storageFull = isClientStorageFullError(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update creation.", ...(storageFull ? { code: CLIENT_STORAGE_FULL_CODE } : {}) }, { status: storageFull ? 409 : 400 });
  }
}
