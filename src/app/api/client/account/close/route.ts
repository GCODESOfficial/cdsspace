import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/admin-auth";
import { clearClientDashboardSessionOnResponse } from "@/lib/client-dashboard-session";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import {
  ACCOUNT_CLOSURE_OTP_MAX_ATTEMPTS,
  ACCOUNT_CLOSURE_OTP_MAX_SENDS_PER_HOUR,
  ACCOUNT_CLOSURE_OTP_RESEND_SECONDS,
  ACCOUNT_CLOSURE_OTP_TTL_MINUTES,
  accountClosureOtpHash,
  accountClosureOtpMatches,
  generateAccountClosureOtp,
  sendAccountClosureOtp,
} from "@/lib/client-account-closure-security";

export const dynamic = "force-dynamic";

interface ClosedAccountRow {
  id: string;
  email: string;
  closed_at: string;
}

interface ClosureChallengeRow {
  user_id: string;
  account_email: string;
  closure_reason: string;
  otp_hash: string;
  expires_at: string;
  resend_available_at: string;
  attempts: number;
  send_count: number;
  send_window_started_at: string;
}

function validatedClosureDetails(body: Record<string, unknown>, accountEmail: string) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (email !== accountEmail) return { error: "Enter the email address currently attached to this account." };
  if (reason.length < 10) return { error: "Please tell us why you are closing the account (at least 10 characters)." };
  if (reason.length > 2000) return { error: "Keep the closure reason within 2,000 characters." };
  return { email, reason };
}

export async function POST(request: Request) {
  const session = await verifyUser();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const accountEmail = session.user.email.trim().toLowerCase();
  const details = validatedClosureDetails(body, accountEmail);
  if ("error" in details) return NextResponse.json({ error: details.error }, { status: 400 });

  const existing = await glashMaybeOne<ClosureChallengeRow>(
    `select * from public.client_account_closure_verifications where user_id = $1::uuid limit 1`,
    [session.user.id],
  );
  const now = Date.now();
  if (existing && new Date(existing.resend_available_at).getTime() > now) {
    const retryAfter = Math.max(1, Math.ceil((new Date(existing.resend_available_at).getTime() - now) / 1000));
    return NextResponse.json({ error: `Wait ${retryAfter} seconds before requesting another code.`, retryAfter }, { status: 429 });
  }
  const sameWindow = existing && now - new Date(existing.send_window_started_at).getTime() < 60 * 60 * 1000;
  if (sameWindow && existing.send_count >= ACCOUNT_CLOSURE_OTP_MAX_SENDS_PER_HOUR) {
    return NextResponse.json({ error: "Too many closure codes were requested. Try again in one hour." }, { status: 429 });
  }

  const otp = generateAccountClosureOtp();
  const expiresAt = new Date(now + ACCOUNT_CLOSURE_OTP_TTL_MINUTES * 60_000);
  const resendAt = new Date(now + ACCOUNT_CLOSURE_OTP_RESEND_SECONDS * 1000);
  await glashQuery(
    `insert into public.client_account_closure_verifications
       (user_id, account_email, closure_reason, otp_hash, expires_at, resend_available_at,
        attempts, send_count, send_window_started_at, last_sent_at, updated_at)
     values ($1::uuid,$2,$3,$4,$5,$6,0,1,now(),now(),now())
     on conflict (user_id) do update
       set account_email = excluded.account_email,
           closure_reason = excluded.closure_reason,
           otp_hash = excluded.otp_hash,
           expires_at = excluded.expires_at,
           resend_available_at = excluded.resend_available_at,
           attempts = 0,
           send_count = case
             when public.client_account_closure_verifications.send_window_started_at < now() - interval '1 hour' then 1
             else public.client_account_closure_verifications.send_count + 1
           end,
           send_window_started_at = case
             when public.client_account_closure_verifications.send_window_started_at < now() - interval '1 hour' then now()
             else public.client_account_closure_verifications.send_window_started_at
           end,
           last_sent_at = now(),
           updated_at = now()`,
    [session.user.id, details.email, details.reason, accountClosureOtpHash(session.user.id, details.email, otp), expiresAt, resendAt],
  );

  try {
    const profile = await glashMaybeOne<{ full_name: string | null }>(
      `select full_name from public.profiles where id = $1::uuid limit 1`,
      [session.user.id],
    );
    await sendAccountClosureOtp({ email: details.email, name: profile?.full_name, otp });
  } catch (error) {
    await glashQuery(`delete from public.client_account_closure_verifications where user_id = $1::uuid`, [session.user.id]).catch(() => []);
    console.error("[client-account-closure] OTP delivery failed:", error);
    return NextResponse.json({ error: "We could not send the verification code. Please try again." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    verificationRequired: true,
    expiresInSeconds: ACCOUNT_CLOSURE_OTP_TTL_MINUTES * 60,
    resendInSeconds: ACCOUNT_CLOSURE_OTP_RESEND_SECONDS,
  });
}

export async function PATCH(request: Request) {
  const session = await verifyUser();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const otp = typeof body.otp === "string" ? body.otp.replace(/\D/g, "").slice(0, 6) : "";
  const accountEmail = session.user.email.trim().toLowerCase();
  if (email !== accountEmail || otp.length !== 6) {
    return NextResponse.json({ error: "Enter the six-digit code sent to your account email." }, { status: 400 });
  }

  const challenge = await glashMaybeOne<ClosureChallengeRow>(
    `select * from public.client_account_closure_verifications where user_id = $1::uuid limit 1`,
    [session.user.id],
  );
  if (!challenge || challenge.account_email !== accountEmail) {
    return NextResponse.json({ error: "Request a new account closure code." }, { status: 404 });
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await glashQuery(`delete from public.client_account_closure_verifications where user_id = $1::uuid`, [session.user.id]);
    return NextResponse.json({ error: "This code has expired. Request a new code." }, { status: 410 });
  }
  if (challenge.attempts >= ACCOUNT_CLOSURE_OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many incorrect attempts. Request a new code." }, { status: 429 });
  }
  if (!accountClosureOtpMatches(challenge.otp_hash, session.user.id, accountEmail, otp)) {
    const attempts = challenge.attempts + 1;
    await glashQuery(
      `update public.client_account_closure_verifications set attempts = $2, updated_at = now() where user_id = $1::uuid`,
      [session.user.id, attempts],
    );
    return NextResponse.json({
      error: attempts >= ACCOUNT_CLOSURE_OTP_MAX_ATTEMPTS ? "Too many incorrect attempts. Request a new code." : "That verification code is incorrect.",
      attemptsRemaining: Math.max(0, ACCOUNT_CLOSURE_OTP_MAX_ATTEMPTS - attempts),
    }, { status: attempts >= ACCOUNT_CLOSURE_OTP_MAX_ATTEMPTS ? 429 : 400 });
  }

  const closed = await glashMaybeOne<ClosedAccountRow>(
    `with verified_challenge as (
       delete from public.client_account_closure_verifications
        where user_id = $1::uuid
          and otp_hash = $3
          and expires_at > now()
          and attempts < $4
       returning account_email, closure_reason
     ), closed_profile as (
       update public.profiles
          set account_status = 'closed',
              closed_at = now(),
              closure_reason = verified_challenge.closure_reason,
              closure_requested_email = verified_challenge.account_email,
              updated_at = now()
         from verified_challenge
        where id = $1::uuid
          and lower(email) = verified_challenge.account_email
          and account_status = 'active'
       returning id, email, closed_at
     ), closure_record as (
       insert into public.client_account_closures
         (user_id, account_email, reason, retained_business_records, closed_at, metadata)
       select closed_profile.id, closed_profile.email, verified_challenge.closure_reason, true, closed_profile.closed_at,
              jsonb_build_object('source', 'client_account_config', 'sessions_revoked', true, 'email_otp_verified', true)
         from closed_profile, verified_challenge
       returning user_id
     )
     select id, email, closed_at from closed_profile`,
    [session.user.id, email, accountClosureOtpHash(session.user.id, accountEmail, otp), ACCOUNT_CLOSURE_OTP_MAX_ATTEMPTS],
  );

  if (!closed) {
    return NextResponse.json({ error: "This account is already closed or could not be matched." }, { status: 409 });
  }

  await session.supabase.auth.signOut({ scope: "global" }).catch(() => undefined);

  return clearClientDashboardSessionOnResponse(NextResponse.json({
    ok: true,
    closedAt: closed.closed_at,
    retainedBusinessRecords: true,
  }));
}
