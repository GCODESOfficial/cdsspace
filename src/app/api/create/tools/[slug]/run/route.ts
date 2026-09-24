import { NextRequest, NextResponse } from "next/server";
import { getCreateActorFromRequest } from "@/lib/create-platform/session";
import { getCreateTool, runCreateTool } from "@/lib/create-platform/server";
import { CLIENT_STORAGE_FULL_CODE, isClientStorageFullError } from "@/lib/client-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hard limits so a malicious or runaway client can't exhaust memory/DB.
const MAX_BODY_BYTES = 26 * 1024 * 1024; // ~26MB total request
const MAX_IMAGE_BYTES = 9 * 1024 * 1024; // per uploaded image data URL (~6.5MB raw)
const MAX_TEXT_CHARS = 8000; // per plain text/textarea field
const MAX_FIELDS = 40; // distinct fields per run

/**
 * Coerce and cap the raw run body into a safe shape:
 * - only keeps primitives + short string arrays
 * - drops oversized images and over-long text
 * - caps the number of fields
 */
function sanitizeRunBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_FIELDS) break;
    if (typeof key !== "string" || key.length > 100) continue;
    if (typeof value === "string") {
      if (value.startsWith("data:")) {
        // Only accept image data URLs, and only within the size cap.
        if (value.startsWith("data:image/") && value.length <= MAX_IMAGE_BYTES) {
          out[key] = value;
          count++;
        }
      } else {
        out[key] = value.slice(0, MAX_TEXT_CHARS);
        count++;
      }
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      count++;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 25).map((item) => String(item).slice(0, 500));
      count++;
    }
    // objects / functions / null are dropped
  }
  return out;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const actor = await getCreateActorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use CREATE." }, { status: 401 });
  if (actor.accessLocked) {
    return NextResponse.json({ error: "CREATE is not available on client accounts yet." }, { status: 403 });
  }
  if (actor.setupRequiredHref) {
    return NextResponse.json({
      error: "Complete your CDS Space account setup before using CREATE.",
      setupRequiredHref: actor.setupRequiredHref,
    }, { status: 403 });
  }

  // Reject oversized uploads before buffering the whole body into memory.
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Upload is too large. Keep images under 6MB." }, { status: 413 });
  }

  const { slug } = await params;
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "CREATE tool not found." }, { status: 404 });
  }
  const tool = await getCreateTool(slug);
  if (!tool) return NextResponse.json({ error: "CREATE tool not found." }, { status: 404 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // Guard against bodies that slip past the content-length check.
  const approxBytes = JSON.stringify(rawBody ?? "").length;
  if (approxBytes > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Upload is too large. Keep images under 6MB." }, { status: 413 });
  }
  const body = sanitizeRunBody(rawBody);

  try {
    const result = await runCreateTool(actor, tool, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE could not run this tool.";
    const storageFull = isClientStorageFullError(error);
    const status = storageFull ? 409 : /credits|quota/i.test(message) ? 402 : 400;
    // Never leak internal stack detail to the client; log it server-side.
    if (status !== 402) console.error(`[create/run] ${slug} failed:`, error);
    return NextResponse.json({ error: message, ...(storageFull ? { code: CLIENT_STORAGE_FULL_CODE } : {}) }, { status });
  }
}
