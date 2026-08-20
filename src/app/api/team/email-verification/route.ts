import { NextResponse } from "next/server";
import { glashMaybeOne, glashPool, glashQuery } from "@/lib/glashdb/postgres";
import { getTeamSession } from "@/lib/team-auth";
import {
  TEAM_EMAIL_OTP_MAX_ATTEMPTS,
  TEAM_EMAIL_OTP_MAX_SENDS_PER_HOUR,
  TEAM_EMAIL_OTP_RESEND_SECONDS,
  TEAM_EMAIL_OTP_TTL_MINUTES,
  generateTeamEmailOtp,
  hashTeamEmailOtp,
  isValidTeamEmail,
  normalizeTeamEmail,
  sendTeamEmailOtp,
  teamEmailOtpMatches,
} from "@/lib/team-email-verification";
import { insertActivityLog } from "@/lib/activity-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VerificationRow {
  pending_email: string;
  expires_at: string;
  last_sent_at: string;
  attempts: number;
  resend_count: number;
  rate_window_started_at: string;
}

function publicChallenge(row: VerificationRow | null) {
  if (!row) return null;
  return {
    pending_email: row.pending_email,
    expires_at: row.expires_at,
    resend_available_at: new Date(new Date(row.last_sent_at).getTime() + TEAM_EMAIL_OTP_RESEND_SECONDS * 1000).toISOString(),
    attempts_remaining: Math.max(0, TEAM_EMAIL_OTP_MAX_ATTEMPTS - Number(row.attempts || 0)),
  };
}

export async function GET() {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const [member, challenge] = await Promise.all([
    glashMaybeOne<{ email: string; email_verified_at: string | null }>(
      "select email, email_verified_at from public.team_members where id = $1 limit 1",
      [session.id],
    ),
    glashMaybeOne<VerificationRow>(
      `select pending_email, expires_at, last_sent_at, attempts, resend_count, rate_window_started_at
         from public.team_email_verifications
        where team_member_id = $1
        limit 1`,
      [session.id],
    ),
  ]);
  if (!member) return NextResponse.json({ ok: false, error: "Team member not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    email: member.email,
    email_verified_at: member.email_verified_at,
    email_complete: isValidTeamEmail(normalizeTeamEmail(member.email)) && !!member.email_verified_at,
    challenge: publicChallenge(challenge),
    otp_ttl_minutes: TEAM_EMAIL_OTP_TTL_MINUTES,
    resend_seconds: TEAM_EMAIL_OTP_RESEND_SECONDS,
  });
}

export async function POST(req: Request) {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = normalizeTeamEmail(body.email);
  if (!isValidTeamEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const duplicate = await glashMaybeOne<{ id: string }>(
    "select id from public.team_members where lower(email) = $1 and id <> $2 limit 1",
    [email, session.id],
  );
  if (duplicate) {
    return NextResponse.json({ ok: false, error: "That email address is already used by another team member." }, { status: 409 });
  }

  const existing = await glashMaybeOne<VerificationRow>(
    `select pending_email, expires_at, last_sent_at, attempts, resend_count, rate_window_started_at
       from public.team_email_verifications
      where team_member_id = $1
      limit 1`,
    [session.id],
  );
  if (existing) {
    const retryAfter = TEAM_EMAIL_OTP_RESEND_SECONDS - Math.floor((Date.now() - new Date(existing.last_sent_at).getTime()) / 1000);
    if (retryAfter > 0) {
      return NextResponse.json(
        { ok: false, error: `Please wait ${retryAfter} seconds before requesting another code.`, retry_after_seconds: retryAfter },
        { status: 429 },
      );
    }
    const windowAge = Date.now() - new Date(existing.rate_window_started_at).getTime();
    if (windowAge < 60 * 60 * 1000 && existing.resend_count >= TEAM_EMAIL_OTP_MAX_SENDS_PER_HOUR) {
      const retryAfterSeconds = Math.max(1, Math.ceil((60 * 60 * 1000 - windowAge) / 1000));
      return NextResponse.json(
        { ok: false, error: "Too many verification emails were requested. Try again later.", retry_after_seconds: retryAfterSeconds },
        { status: 429 },
      );
    }
  }

  const otp = generateTeamEmailOtp();
  let otpHash: string;
  try {
    otpHash = hashTeamEmailOtp(session.id, email, otp);
  } catch {
    return NextResponse.json({ ok: false, error: "Email verification is temporarily unavailable." }, { status: 503 });
  }
  const expiresAt = new Date(Date.now() + TEAM_EMAIL_OTP_TTL_MINUTES * 60 * 1000);
  const windowExpired = !existing || Date.now() - new Date(existing.rate_window_started_at).getTime() >= 60 * 60 * 1000;

  try {
    await glashQuery(
      `insert into public.team_email_verifications
        (team_member_id, pending_email, otp_hash, expires_at, last_sent_at, attempts,
         resend_count, rate_window_started_at)
       values ($1,$2,$3,$4,now(),0,1,now())
       on conflict (team_member_id) do update set
         pending_email = excluded.pending_email,
         otp_hash = excluded.otp_hash,
         expires_at = excluded.expires_at,
         last_sent_at = now(),
         attempts = 0,
         resend_count = case when $5 then 1 else public.team_email_verifications.resend_count + 1 end,
         rate_window_started_at = case when $5 then now() else public.team_email_verifications.rate_window_started_at end`,
      [session.id, email, otpHash, expiresAt.toISOString(), windowExpired],
    );
  } catch (error) {
    if (String((error as { code?: string }).code || "") === "23505") {
      return NextResponse.json({ ok: false, error: "That email address is already awaiting verification for another account." }, { status: 409 });
    }
    console.error("[team-email-verification] challenge persistence failed:", error);
    return NextResponse.json({ ok: false, error: "Email verification could not be started." }, { status: 500 });
  }

  try {
    await sendTeamEmailOtp({ email, memberName: session.full_name, otp });
  } catch (error) {
    await glashQuery(
      `update public.team_email_verifications
          set last_sent_at = now() - interval '61 seconds'
        where team_member_id = $1 and pending_email = $2`,
      [session.id, email],
    ).catch(() => []);
    console.error("[team-email-verification] OTP email failed:", error);
    return NextResponse.json({ ok: false, error: "The verification email could not be sent. Please try again." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: `A verification code was sent to ${email}.`,
    challenge: {
      pending_email: email,
      expires_at: expiresAt.toISOString(),
      resend_available_at: new Date(Date.now() + TEAM_EMAIL_OTP_RESEND_SECONDS * 1000).toISOString(),
      attempts_remaining: TEAM_EMAIL_OTP_MAX_ATTEMPTS,
    },
  });
}

export async function PATCH(req: Request) {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const otp = String(body.otp || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ ok: false, error: "Enter the six-digit verification code." }, { status: 400 });
  }

  const client = await glashPool.connect();
  try {
    await client.query("begin");
    const challenge = (await client.query<VerificationRow & { otp_hash: string }>(
      `select pending_email, otp_hash, expires_at, last_sent_at, attempts, resend_count, rate_window_started_at
         from public.team_email_verifications
        where team_member_id = $1
        for update`,
      [session.id],
    )).rows[0];
    if (!challenge) {
      await client.query("rollback");
      return NextResponse.json({ ok: false, error: "Request a verification code first." }, { status: 404 });
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await client.query("delete from public.team_email_verifications where team_member_id = $1", [session.id]);
      await client.query("commit");
      return NextResponse.json({ ok: false, error: "That code has expired. Request a new one." }, { status: 410 });
    }
    if (challenge.attempts >= TEAM_EMAIL_OTP_MAX_ATTEMPTS) {
      await client.query("delete from public.team_email_verifications where team_member_id = $1", [session.id]);
      await client.query("commit");
      return NextResponse.json({ ok: false, error: "Too many incorrect attempts. Request a new code." }, { status: 429 });
    }
    if (!teamEmailOtpMatches(challenge.otp_hash, session.id, challenge.pending_email, otp)) {
      const nextAttempts = Number(challenge.attempts || 0) + 1;
      if (nextAttempts >= TEAM_EMAIL_OTP_MAX_ATTEMPTS) {
        await client.query("delete from public.team_email_verifications where team_member_id = $1", [session.id]);
      } else {
        await client.query(
          "update public.team_email_verifications set attempts = $2 where team_member_id = $1",
          [session.id, nextAttempts],
        );
      }
      await client.query("commit");
      return NextResponse.json({
        ok: false,
        error: nextAttempts >= TEAM_EMAIL_OTP_MAX_ATTEMPTS
          ? "Too many incorrect attempts. Request a new code."
          : "That verification code is incorrect.",
        attempts_remaining: Math.max(0, TEAM_EMAIL_OTP_MAX_ATTEMPTS - nextAttempts),
      }, { status: nextAttempts >= TEAM_EMAIL_OTP_MAX_ATTEMPTS ? 429 : 400 });
    }

    const duplicate = (await client.query<{ id: string }>(
      "select id from public.team_members where lower(email) = $1 and id <> $2 limit 1",
      [challenge.pending_email, session.id],
    )).rows[0];
    if (duplicate) {
      await client.query("delete from public.team_email_verifications where team_member_id = $1", [session.id]);
      await client.query("commit");
      return NextResponse.json({ ok: false, error: "That email address is already used by another team member." }, { status: 409 });
    }

    const verifiedAt = new Date().toISOString();
    await client.query(
      "update public.team_members set email = $2, email_verified_at = $3, updated_at = now() where id = $1",
      [session.id, challenge.pending_email, verifiedAt],
    );
    await client.query("delete from public.team_email_verifications where team_member_id = $1", [session.id]);
    await client.query("commit");

    await insertActivityLog({
      actor_kind: "team",
      actor_id: session.id,
      actor_name: session.full_name,
      actor_is_admin: false,
      action: "team.email_verified",
      page: "team/settings",
      resource_type: "team_member",
      resource_id: session.id,
      resource_label: session.full_name,
      metadata: {},
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      message: "Your email address has been verified.",
      email: challenge.pending_email,
      email_verified_at: verifiedAt,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (String((error as { code?: string }).code || "") === "23505") {
      return NextResponse.json({ ok: false, error: "That email address is already used by another team member." }, { status: 409 });
    }
    console.error("[team-email-verification] verification failed:", error);
    return NextResponse.json({ ok: false, error: "Email verification could not be completed." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE() {
  const session = await getTeamSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  await glashQuery(
    "delete from public.team_email_verifications where team_member_id = $1",
    [session.id],
  );
  return NextResponse.json({ ok: true });
}
