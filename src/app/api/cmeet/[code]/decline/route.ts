import { after, NextResponse } from "next/server";
import { cancelCallOnPhones } from "@/lib/mobile-call-push";
import { getToolActor } from "@/lib/team-tools-auth";
import { getClientAccountState } from "@/lib/client-account";
import { declineCall } from "@/lib/cmeet-call-roster";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cmeet/[code]/decline - the signed-in person turns down a ringing
 * call. It stops ringing on all their devices and the caller's screen shows
 * "Call declined". Team members and admins are keyed as in
 * /api/admin/calls/[id]/action (member id, else email); clients by user id.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!code) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  const actor = await getToolActor();
  const account = actor ? null : await getClientAccountState().catch(() => null);
  if (!actor && !account?.user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const meeting = await glashMaybeOne<{ id: string }>(
    `select id::text from public.team_meetings where room_code = $1 and status = 'live' and ended_at is null`,
    [code],
  );
  // Already over: nothing is ringing any more, which is what the caller wanted.
  if (!meeting) return NextResponse.json({ ok: true });

  const actorKey = actor?.kind === "team"
    ? actor.id
    : actor?.kind === "admin"
      ? String(actor.memberId || actor.email || "admin")
      : `client:${account!.user.id}`;
  const actorName = actor
    ? actor.name || null
    : account!.profile.full_name || account!.profile.company_name || account!.profile.email || null;

  try {
    await declineCall({ meetingId: meeting.id, actorKey, actorName, clientUserId: actor ? null : account!.user.id });
    // Stop it ringing on this person's other phones.
    const subjects = actor ? [`team:${actorKey}`, `admin:${actorKey}`] : [actorKey];
    after(() => cancelCallOnPhones(meeting.id, { subjects }));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "The call could not be declined." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
