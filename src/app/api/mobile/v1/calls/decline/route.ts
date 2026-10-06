import { after } from "next/server";
import { declineCall } from "@/lib/cmeet-call-roster";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { mobileJson } from "@/lib/mobile-api";
import { cancelCallOnPhones, verifyDeclineToken } from "@/lib/mobile-call-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/v1/calls/decline?t=<signed token> - "Decline" on a phone's
 * incoming-call notification or lock screen. The phone may not have a usable
 * session there, so the push that rang it carried a signed token naming the
 * call and the person (lib/mobile-call-push.ts).
 */
export async function POST(request: Request) {
  const verified = verifyDeclineToken(new URL(request.url).searchParams.get("t") || "");
  if (!verified) return mobileJson({ error: "This call can no longer be declined." }, 400);
  const { meetingId, subject } = verified;

  const meeting = await glashMaybeOne<{ id: string }>(
    `select id::text from public.team_meetings where id = $1::uuid and status = 'live' and ended_at is null`,
    [meetingId],
  );
  if (!meeting) return mobileJson({ ok: true });

  const [portal, ...rest] = subject.split(":");
  const id = rest.join(":");
  // Same actor keys as POST /api/cmeet/[code]/decline.
  const actorKey = portal === "client" ? subject : id;
  await declineCall({ meetingId, actorKey, clientUserId: portal === "client" ? id : null });
  after(() => cancelCallOnPhones(meetingId, { subjects: portal === "client" ? [subject] : [`team:${id}`, `admin:${id}`] }));
  return mobileJson({ ok: true });
}
