import { NextRequest, NextResponse } from "next/server";
import { getChallengeFromHandoffCode } from "@/lib/face-verification";
import { glashMaybeOne } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = String(req.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ ok: false, error: "Face handoff code is required." }, { status: 400 });
  }

  const challenge = await getChallengeFromHandoffCode(code);
  if (!challenge) {
    return NextResponse.json({ ok: false, error: "Face handoff code was not found." }, { status: 404 });
  }
  if (challenge.consumed_at || challenge.result === "passed") {
    return NextResponse.json({ ok: true, status: "completed" });
  }
  if (new Date(challenge.expires_at) < new Date()) {
    return NextResponse.json({ ok: true, status: "expired" });
  }

  const member = await glashMaybeOne<{ full_name: string | null }>(
    "select full_name from public.team_members where id = $1 limit 1",
    [challenge.team_member_id],
  );

  return NextResponse.json({
    ok: true,
    status: "pending",
    challenge: {
      token: "mobile:" + code,
      purpose: challenge.purpose,
      actions: challenge.challenge_actions || [],
      expires_at: challenge.expires_at,
    },
    member: {
      full_name: member?.full_name || null,
    },
  });
}
