import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasPermission } from "@/lib/admin-permissions";
import { callTransferTargets, recordCallAction, redirectCall, rescheduleCall } from "@/lib/cmeet-call-handling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * What an admin does about an incoming client call: hand it to a colleague,
 * offer another time, or note that it went unanswered.
 */
async function authorise() {
  const session = await getAdminSession();
  if (!session) return null;
  if (session.role !== "super_admin" && !hasPermission(session.permissions || [], "messages")) return null;
  return session;
}

/** The colleagues this call can be handed to. */
export async function GET() {
  const session = await authorise();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, colleagues: await callTransferTargets() });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await authorise();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Unknown call." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const actorKey = String(session.memberId || session.email || "admin");
  const actorName = session.name || session.email || null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 400) : null;

  try {
    if (body.action === "redirect") {
      const result = await redirectCall({
        meetingId: id,
        actorKey,
        actorName,
        targetMemberId: String(body.targetMemberId || ""),
        note,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "reschedule") {
      const result = await rescheduleCall({
        meetingId: id,
        actorKey,
        actorName,
        scheduledFor: String(body.scheduledFor || ""),
        note,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "unavailable") {
      // Recorded when the call rang out, so it stops ringing for this admin
      // and the client is told nobody was free.
      await recordCallAction({ meetingId: id, actorKey, actorName, action: "unavailable" });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "That call could not be updated." },
      { status: 400 },
    );
  }
}
