import "server-only";

import crypto from "node:crypto";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { getGlashDbAdmin } from "@/lib/glashdb";

/**
 * Client email verification owned by CDS Space.
 *
 * Email/password accounts are created unconfirmed in GlashDB and prove the
 * address here: a six-digit code typed into the sign-up page, with a
 * single-use link in the same email as a fallback. Either one marks
 * profiles.email_verified_at, which is what the client dashboard checks, and
 * confirms the account in GlashDB so its login accepts it. Google and LinkedIn
 * accounts are provider-verified and never pass through here.
 */

const SIGNUP_TTL_MS = 30 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
export const CLIENT_SIGNUP_CODE_MAX_ATTEMPTS = 5;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Bound to the account and address, so a code is worthless for any other row.
function hashCode(userId: string, email: string, code: string) {
  return hashToken(`signup-code:${userId}:${email.toLowerCase()}:${code}`);
}

export type ClientTokenPurpose = "signup" | "password_reset";

async function insertToken(input: {
  userId: string;
  email: string;
  nextPath: string;
  purpose: ClientTokenPurpose;
  codeHash?: string | null;
}) {
  // 32 random bytes: long enough that the hash alone is safe to store.
  const token = crypto.randomBytes(32).toString("base64url");
  const ttl = input.purpose === "password_reset" ? RESET_TTL_MS : SIGNUP_TTL_MS;
  await glashQuery(
    `insert into public.client_email_verifications (user_id, email, token_hash, next_path, expires_at, purpose, code_hash)
     values ($1::uuid, $2, $3, $4, now() + ($5 || ' milliseconds')::interval, $6, $7)`,
    [input.userId, input.email, hashToken(token), input.nextPath, String(ttl), input.purpose, input.codeHash || null],
  );
  return token;
}

/** A password-reset link. A reset link can never verify an address, and a sign-up code or link can never set a password. */
export async function issueClientEmailVerification(input: {
  userId: string;
  email: string;
  nextPath: string;
  siteUrl: string;
  purpose?: ClientTokenPurpose;
}) {
  const purpose = input.purpose || "signup";
  if (purpose === "signup") return (await issueClientSignupVerification(input)).link;
  const token = await insertToken({ ...input, purpose });
  return `${input.siteUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * A sign-up code and its fallback link, valid 30 minutes. Any earlier code for
 * the account stops working, so only the newest email can verify it.
 */
export async function issueClientSignupVerification(input: {
  userId: string;
  email: string;
  nextPath: string;
  siteUrl: string;
}) {
  await glashQuery(
    `update public.client_email_verifications set used_at = now()
      where user_id = $1::uuid and purpose = 'signup' and used_at is null`,
    [input.userId],
  );
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const token = await insertToken({
    ...input,
    purpose: "signup",
    codeHash: hashCode(input.userId, input.email, code),
  });
  return {
    code,
    link: `${input.siteUrl.replace(/\/$/, "")}/auth/verify-email?token=${encodeURIComponent(token)}`,
    expiresInSeconds: SIGNUP_TTL_MS / 1000,
  };
}

type SpentVerification = { user_id: string; email: string; next_path: string | null };

/**
 * Spends a token. Returns what it was issued for, or null when it is unknown,
 * expired or already used. Marking it used happens in the same statement, so
 * two tabs opening the same link cannot both succeed.
 */
export async function consumeClientEmailVerification(token: string, purpose: ClientTokenPurpose = "signup") {
  if (!token || token.length > 200) return null;
  return glashMaybeOne<SpentVerification>(
    `update public.client_email_verifications
        set used_at = now()
      where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
      returning user_id::text, email, next_path`,
    [hashToken(token), purpose],
  );
}

/**
 * Checks a typed sign-up code against the newest pending code for the address.
 * Five wrong guesses spend the code, so it cannot be brute-forced.
 */
export async function consumeClientSignupCode(email: string, code: string): Promise<
  | { status: "ok"; spent: SpentVerification }
  | { status: "wrong"; attemptsRemaining: number }
  | { status: "expired" }
> {
  const row = await glashMaybeOne<{ id: string; user_id: string; email: string; code_hash: string | null; attempts: number; expired: boolean }>(
    `select id::text, user_id::text, email, code_hash, attempts, expires_at <= now() as expired
       from public.client_email_verifications
      where lower(email) = lower($1) and purpose = 'signup' and used_at is null
      order by created_at desc
      limit 1`,
    [email],
  );
  if (!row || !row.code_hash || row.expired || row.attempts >= CLIENT_SIGNUP_CODE_MAX_ATTEMPTS) {
    return { status: "expired" };
  }

  const expected = Buffer.from(row.code_hash, "hex");
  const given = Buffer.from(hashCode(row.user_id, row.email, code), "hex");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    const bumped = await glashMaybeOne<{ attempts: number }>(
      `update public.client_email_verifications
          set attempts = attempts + 1,
              used_at = case when attempts + 1 >= $2 then now() else used_at end
        where id = $1::uuid and used_at is null
        returning attempts`,
      [row.id, CLIENT_SIGNUP_CODE_MAX_ATTEMPTS],
    );
    const remaining = CLIENT_SIGNUP_CODE_MAX_ATTEMPTS - Number(bumped?.attempts ?? CLIENT_SIGNUP_CODE_MAX_ATTEMPTS);
    return remaining > 0 ? { status: "wrong", attemptsRemaining: remaining } : { status: "expired" };
  }

  const spent = await glashMaybeOne<SpentVerification>(
    `update public.client_email_verifications
        set used_at = now()
      where id = $1::uuid and used_at is null and expires_at > now()
      returning user_id::text, email, next_path`,
    [row.id],
  );
  return spent ? { status: "ok", spent } : { status: "expired" };
}

/**
 * Marks the address verified, creates the client profile with the sign-up
 * details, and confirms the account in GlashDB. Shared by the typed code and
 * the emailed link. The profile is created here rather than at sign-up so an
 * admin is only told about a new client once the address is real.
 */
export async function completeClientEmailVerification(spent: SpentVerification) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getGlashDbAdmin() as any;
  const { data } = await admin.auth.admin.getUserById(spent.user_id).catch(() => ({ data: null }));
  const meta = (data?.user?.user_metadata || {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

  await glashQuery(
    `insert into public.profiles (id, email, email_verified_at, full_name, company_name, phone_number, updated_at)
     values ($1::uuid, lower($2), now(), $3, $4, $5, now())
     on conflict (id) do update set
       email_verified_at = coalesce(public.profiles.email_verified_at, now()),
       full_name = coalesce(public.profiles.full_name, excluded.full_name),
       company_name = coalesce(public.profiles.company_name, excluded.company_name),
       phone_number = coalesce(public.profiles.phone_number, excluded.phone_number),
       updated_at = now()`,
    [spent.user_id, spent.email, text(meta.full_name), text(meta.company_name), text(meta.phone_number)],
  );

  // Without this GlashDB's own login keeps refusing it with "email not verified".
  const confirmed = await admin.auth.admin.updateUserById(spent.user_id, { email_confirm: true }).catch((error: unknown) => ({ error }));
  if (confirmed?.error) {
    console.error("[client-email-verification] GlashDB confirmation failed", confirmed.error);
  }
}

/** Checks a reset token is still usable without spending it, so the form can show or refuse. */
export async function peekClientPasswordReset(token: string) {
  if (!token || token.length > 200) return null;
  return glashMaybeOne<{ user_id: string }>(
    `select user_id::text from public.client_email_verifications
      where token_hash = $1 and purpose = 'password_reset' and used_at is null and expires_at > now()`,
    [hashToken(token)],
  );
}

/** The most recent account still waiting on verification for this address. */
export async function findPendingClientVerification(email: string) {
  return glashMaybeOne<{ user_id: string; next_path: string | null }>(
    `select v.user_id::text, v.next_path
       from public.client_email_verifications v
      where lower(v.email) = lower($1)
        and v.purpose = 'signup'
        and not exists (
          select 1 from public.profiles p
           where p.id = v.user_id and p.email_verified_at is not null
        )
      order by v.created_at desc
      limit 1`,
    [email],
  );
}
