import "server-only";

import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { brandedEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-from";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";

export const CLIENT_LOGIN_OTP_TTL_MINUTES = 15;
export const CLIENT_LOGIN_OTP_RESEND_SECONDS = 60;
export const CLIENT_SIGNUP_RESEND_SECONDS = 60;
export const CLIENT_LOGIN_MAX_ATTEMPTS = 5;
export const CLIENT_LOGIN_MAX_OTP_SENDS = 5;
export const CLIENT_LOGIN_BINDING_COOKIE = "cds_client_login_binding";

const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const INTERNAL_BOT_TOKEN_PREFIX = "cdsb1";
const INTERNAL_BOT_CHALLENGE_TTL_MS = 5 * 60_000;

export type BotProtectionAction = "client_login" | "client_signup" | "password_reset";

type InternalBotChallengePayload = {
  v: 1;
  action: BotProtectionAction;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  ipHash: string;
  userAgentHash: string;
  difficulty: number;
};

function securitySecret() {
  const secret = process.env.CLIENT_LOGIN_SECURITY_SECRET
    || process.env.ADMIN_SESSION_SECRET
    || process.env.GLASHDB_SERVICE_ROLE_KEY
    || "";
  if (!secret) throw new Error("Client login security is not configured.");
  return secret;
}

export function normalizeClientEmail(value: unknown) {
  return String(value || "").trim().toLowerCase().slice(0, 320);
}

export function securityHash(purpose: string, value: string) {
  return createHmac("sha256", securitySecret())
    .update(`${purpose}:${value}`)
    .digest("hex");
}

export function createLoginBinding() {
  return randomBytes(32).toString("base64url");
}

export function clientLoginOtpHash(userId: string, email: string, otp: string) {
  return securityHash("client-login-otp", `${userId}:${normalizeClientEmail(email)}:${otp}`);
}

export function clientLoginOtpMatches(expectedHash: string, userId: string, email: string, otp: string) {
  try {
    const expected = Buffer.from(expectedHash, "hex");
    const received = Buffer.from(clientLoginOtpHash(userId, email, otp), "hex");
    return expected.length === received.length && timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export function bindingMatches(expectedHash: string, binding: string) {
  try {
    const expected = Buffer.from(expectedHash, "hex");
    const received = Buffer.from(securityHash("client-login-binding", binding), "hex");
    return expected.length === received.length && timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export async function clientRequestContext() {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("cf-connecting-ip")
    || requestHeaders.get("x-real-ip")
    || requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  return {
    ip,
    ipHash: securityHash("client-network", ip),
    userAgentHash: securityHash("client-user-agent", requestHeaders.get("user-agent") || "unknown"),
  };
}

function internalBotDifficulty() {
  const configured = Number(process.env.INTERNAL_BOT_POW_DIFFICULTY_BITS || 14);
  return Math.min(20, Math.max(12, Number.isFinite(configured) ? Math.round(configured) : 14));
}

function safeHexEqual(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length > 0
      && leftBuffer.length === rightBuffer.length
      && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function hasLeadingZeroBits(digest: Buffer, requiredBits: number) {
  const wholeBytes = Math.floor(requiredBits / 8);
  const remainingBits = requiredBits % 8;
  for (let index = 0; index < wholeBytes; index += 1) {
    if (digest[index] !== 0) return false;
  }
  if (remainingBits === 0) return true;
  return (digest[wholeBytes] & (0xff << (8 - remainingBits))) === 0;
}

export async function createInternalBotChallenge(action: BotProtectionAction) {
  const context = await clientRequestContext();
  const limited = await consumeSecurityRateLimit({
    bucket: "internal-bot-challenge-network",
    identifier: context.ipHash,
    limit: 40,
    windowSeconds: 10 * 60,
    blockSeconds: 10 * 60,
  });
  if (limited) return null;

  const now = Date.now();
  const payload: InternalBotChallengePayload = {
    v: 1,
    action,
    issuedAt: now,
    expiresAt: now + INTERNAL_BOT_CHALLENGE_TTL_MS,
    nonce: randomBytes(18).toString("base64url"),
    ipHash: context.ipHash,
    userAgentHash: context.userAgentHash,
    difficulty: internalBotDifficulty(),
  };
  const challenge = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    challenge,
    signature: securityHash("internal-bot-challenge", challenge),
    difficulty: payload.difficulty,
    expiresAt: payload.expiresAt,
  };
}

async function verifyInternalBotToken(input: {
  token: string;
  action: BotProtectionAction;
}) {
  const parts = input.token.split(".");
  if (parts.length !== 4 || parts[0] !== INTERNAL_BOT_TOKEN_PREFIX) return false;
  const [, challenge, signature, counterValue] = parts;
  if (!challenge || challenge.length > 2048 || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (!/^\d{1,10}$/.test(counterValue)) return false;
  const counter = Number(counterValue);
  if (!Number.isSafeInteger(counter) || counter < 0 || counter > 0xffffffff) return false;

  const expectedSignature = securityHash("internal-bot-challenge", challenge);
  if (!safeHexEqual(signature, expectedSignature)) return false;

  let payload: InternalBotChallengePayload;
  try {
    payload = JSON.parse(Buffer.from(challenge, "base64url").toString("utf8")) as InternalBotChallengePayload;
  } catch {
    return false;
  }

  const now = Date.now();
  const context = await clientRequestContext();
  if (
    payload.v !== 1
    || payload.action !== input.action
    || !Number.isFinite(payload.issuedAt)
    || !Number.isFinite(payload.expiresAt)
    || payload.issuedAt > now + 10_000
    || payload.expiresAt <= now
    || payload.expiresAt - payload.issuedAt > INTERNAL_BOT_CHALLENGE_TTL_MS + 10_000
    || payload.difficulty < 12
    || payload.difficulty > 20
    || payload.ipHash !== context.ipHash
    || payload.userAgentHash !== context.userAgentHash
  ) return false;

  const digest = createHash("sha256").update(`${challenge}.${counter}`).digest();
  if (!hasLeadingZeroBits(digest, payload.difficulty)) return false;

  // A solved proof is single-use. The durable counter also prevents replay
  // across application instances, which an in-memory nonce set cannot do.
  const replayed = await consumeSecurityRateLimit({
    bucket: "internal-bot-proof",
    identifier: signature,
    limit: 1,
    windowSeconds: 10 * 60,
    blockSeconds: 10 * 60,
  });
  return !replayed;
}

async function verifyTurnstileToken(input: {
  token: unknown;
  remoteIp: string;
  action: BotProtectionAction;
}) {
  const token = String(input.token || "");
  if (!token || token.length > 2048) return false;

  const secret = process.env.TURNSTILE_SECRET_KEY
    || (process.env.NODE_ENV !== "production" ? TURNSTILE_TEST_SECRET : "");
  if (!secret) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: input.remoteIp === "unknown" ? undefined : input.remoteIp,
        idempotency_key: randomUUID(),
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = await response.json() as { success?: boolean; action?: string; hostname?: string };
    if (!result.success) return false;
    if (result.action && result.action !== input.action && result.action !== "test") return false;

    if (process.env.NODE_ENV === "production" && result.hostname) {
      const configured = process.env.NEXT_PUBLIC_SITE_URL;
      if (configured) {
        const expected = new URL(configured).hostname.toLowerCase();
        const actual = result.hostname.toLowerCase();
        if (actual !== expected && actual !== `www.${expected}` && `www.${actual}` !== expected) return false;
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyBotProtection(input: {
  token: unknown;
  remoteIp: string;
  action: BotProtectionAction;
}) {
  const token = String(input.token || "");
  if (token.startsWith(`${INTERNAL_BOT_TOKEN_PREFIX}.`)) {
    return verifyInternalBotToken({ token, action: input.action });
  }
  return verifyTurnstileToken(input);
}

export async function consumeSecurityRateLimit(input: {
  bucket: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
}) {
  const keyHash = securityHash(`rate:${input.bucket}`, input.identifier);
  const row = await glashMaybeOne<{ request_count: number; blocked_until: string | null }>(
    `insert into public.security_rate_limits
       (key_hash, window_started_at, request_count, blocked_until, updated_at)
     values ($1, now(), 1, null, now())
     on conflict (key_hash) do update set
       request_count = case
         when public.security_rate_limits.window_started_at <= now() - make_interval(secs => $3::int) then 1
         else public.security_rate_limits.request_count + 1
       end,
       window_started_at = case
         when public.security_rate_limits.window_started_at <= now() - make_interval(secs => $3::int) then now()
         else public.security_rate_limits.window_started_at
       end,
       blocked_until = case
         when public.security_rate_limits.blocked_until > now() then public.security_rate_limits.blocked_until
         when (
           case
             when public.security_rate_limits.window_started_at <= now() - make_interval(secs => $3::int) then 1
             else public.security_rate_limits.request_count + 1
           end
         ) > $2::int then now() + make_interval(secs => $4::int)
         else null
       end,
       updated_at = now()
     returning request_count, blocked_until`,
    [keyHash, input.limit, input.windowSeconds, input.blockSeconds],
  );
  const blockedUntil = row?.blocked_until ? new Date(row.blocked_until).getTime() : 0;
  return Boolean(blockedUntil > Date.now() || Number(row?.request_count || 0) > input.limit);
}

export async function isClientLoginLocked(email: string) {
  const identityHash = securityHash("client-login-identity", normalizeClientEmail(email));
  const row = await glashMaybeOne<{ failed_count: number; locked_at: string | null }>(
    "select failed_count, locked_at from public.client_login_attempts where identity_hash = $1 limit 1",
    [identityHash],
  );
  return Boolean(row?.locked_at || Number(row?.failed_count || 0) >= CLIENT_LOGIN_MAX_ATTEMPTS);
}

export async function recordClientLoginFailure(email: string) {
  const identityHash = securityHash("client-login-identity", normalizeClientEmail(email));
  const row = await glashMaybeOne<{ failed_count: number; locked_at: string | null }>(
    `insert into public.client_login_attempts
       (identity_hash, failed_count, first_failed_at, last_failed_at, locked_at, updated_at)
     values ($1, 1, now(), now(), null, now())
     on conflict (identity_hash) do update set
       failed_count = least($2::int, public.client_login_attempts.failed_count + 1),
       last_failed_at = now(),
       locked_at = case
         when public.client_login_attempts.failed_count + 1 >= $2::int
           then coalesce(public.client_login_attempts.locked_at, now())
         else public.client_login_attempts.locked_at
       end,
       updated_at = now()
     returning failed_count, locked_at`,
    [identityHash, CLIENT_LOGIN_MAX_ATTEMPTS],
  );
  return {
    locked: Boolean(row?.locked_at || Number(row?.failed_count || 0) >= CLIENT_LOGIN_MAX_ATTEMPTS),
    attemptsRemaining: Math.max(0, CLIENT_LOGIN_MAX_ATTEMPTS - Number(row?.failed_count || 0)),
  };
}

export async function clearClientLoginFailures(email: string) {
  await glashQuery(
    "delete from public.client_login_attempts where identity_hash = $1",
    [securityHash("client-login-identity", normalizeClientEmail(email))],
  );
}

export interface ClientLoginChallenge {
  id: string;
  user_id: string;
  email: string;
  otp_hash: string;
  browser_binding_hash: string;
  next_path: string;
  expires_at: string;
  resend_available_at: string;
  attempts: number;
  send_count: number;
}

export async function getClientLoginChallenge(id: string) {
  return glashMaybeOne<ClientLoginChallenge>(
    `select id, user_id, email, otp_hash, browser_binding_hash, next_path,
            expires_at, resend_available_at, attempts, send_count
       from public.client_login_verifications
      where id = $1::uuid
      limit 1`,
    [id],
  );
}

export async function createClientLoginChallenge(input: {
  userId: string;
  email: string;
  otp: string;
  binding: string;
  nextPath: string;
}) {
  const expiresAt = new Date(Date.now() + CLIENT_LOGIN_OTP_TTL_MINUTES * 60_000);
  const resendAt = new Date(Date.now() + CLIENT_LOGIN_OTP_RESEND_SECONDS * 1_000);
  return glashMaybeOne<{ id: string }>(
    `insert into public.client_login_verifications
       (user_id, email, otp_hash, browser_binding_hash, next_path, expires_at,
        resend_available_at, attempts, send_count, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,0,1,now(),now())
     on conflict (user_id) do update set
       id = gen_random_uuid(),
       email = excluded.email,
       otp_hash = excluded.otp_hash,
       browser_binding_hash = excluded.browser_binding_hash,
       next_path = excluded.next_path,
       expires_at = excluded.expires_at,
       resend_available_at = excluded.resend_available_at,
       attempts = 0,
       send_count = 1,
       created_at = now(),
       updated_at = now()
     returning id`,
    [
      input.userId,
      normalizeClientEmail(input.email),
      clientLoginOtpHash(input.userId, input.email, input.otp),
      securityHash("client-login-binding", input.binding),
      input.nextPath,
      expiresAt.toISOString(),
      resendAt.toISOString(),
    ],
  );
}

// The six-digit sign-in code is CDS Space's own: only its hash is stored and it
// is checked by clientLoginOtpMatches. It used to be GlashDB's magic-link OTP,
// but GlashDB's codes are no longer six digits, and every screen (web, app,
// email) is built around six.
export function generateClientEmailOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// After the code has been checked, open the GlashDB session: mint a single-use
// magic-link token for the account and redeem it at once. Nothing is emailed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function redeemClientLoginSession(authClient: any, email: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getGlashDbAdmin() as any;
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    const reason = error ? `${error.status || ""} ${error.code || ""} ${error.message || ""}`.trim() : "no hashed_token in response";
    throw new Error(`Could not prepare the sign-in session (${reason}).`);
  }
  const type = data.properties.verification_type || "magiclink";
  return authClient.auth.verifyOtp({ token_hash: tokenHash, type });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendClientLoginOtp(input: { email: string; name?: string | null; otp: string }) {
  const firstName = String(input.name || "client").trim().split(/\s+/)[0] || "client";
  const html = brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:24px;line-height:1.25;">Confirm your sign-in</h1>
     <p style="margin:0 0 16px;">Hello ${escapeHtml(firstName)},</p>
     <p style="margin:0 0 18px;">Your password was accepted. Enter this one-time code to finish signing in to your CDS Space client dashboard.</p>
     <div style="margin:0 0 18px;border:1px solid #DDE5F4;border-radius:12px;background:#F8FAFD;padding:18px;text-align:center;">
       <div style="font-size:12px;color:#69738D;">One-time sign-in code</div>
       <div style="margin-top:8px;color:#0D1B39;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:800;letter-spacing:6px;">${escapeHtml(input.otp)}</div>
     </div>
     <p style="margin:0 0 12px;"><strong>This code expires in ${CLIENT_LOGIN_OTP_TTL_MINUTES} minutes.</strong></p>
     <p style="margin:0;color:#69738D;font-size:13px;line-height:1.6;">CDS Space will never ask you to send your password or this code by email, chat or phone. If you did not attempt to sign in, reset your password from cdsspace.pro.</p>`,
    { eyebrow: "Secure client access", preheader: "Confirm your CDS Space sign-in with this 15-minute code." },
  );
  await sendEmail({
    to: input.email,
    subject: "Your CDS Space sign-in code",
    text: `Your CDS Space sign-in code is ${input.otp}. It expires in ${CLIENT_LOGIN_OTP_TTL_MINUTES} minutes. Never share this code.`,
    html,
    fromName: "CDS Space Security",
  });
}

export async function sendClientSignupVerification(input: {
  email: string;
  name?: string | null;
  actionLink: string;
  code: string;
}) {
  const firstName = String(input.name || "client").trim().split(/\s+/)[0] || "client";
  const safeLink = escapeHtml(input.actionLink);
  const code = escapeHtml(input.code);
  const html = brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:24px;line-height:1.25;">Verify your email address</h1>
     <p style="margin:0 0 16px;">Hello ${escapeHtml(firstName)},</p>
     <p style="margin:0 0 18px;">Enter this code on the CDS Space sign-up page to confirm you own this email address and activate your account.</p>
     <div style="margin:0 0 18px;border-radius:12px;background:#F2F5FC;padding:16px;text-align:center;font-family:Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#0D1B39;">${code}</div>
     <p style="margin:0 0 18px;color:#69738D;font-size:13px;line-height:1.6;">The code expires in 30 minutes. Opened this on another device? Use the button instead.</p>
     <a href="${safeLink}" style="display:inline-block;border-radius:10px;background:#0A4FE8;padding:12px 20px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;">Verify email and activate account</a>
     <p style="margin:20px 0 0;color:#69738D;font-size:13px;line-height:1.6;">If you did not request this account, ignore this email. CDS Space will never ask you for this code by phone or chat.</p>`,
    { eyebrow: "Account verification", preheader: `Your CDS Space verification code is ${input.code}.` },
  );
  await sendEmail({
    to: input.email,
    subject: `${input.code} is your CDS Space verification code`,
    text: `Your CDS Space verification code is ${input.code}. It expires in 30 minutes.\n\nOr verify with this link: ${input.actionLink}\n\nIf you did not request this account, ignore this email.`,
    html,
    fromName: "CDS Space Security",
  });
}

export async function sendClientPasswordReset(input: { email: string; actionLink: string }) {
  const safeLink = escapeHtml(input.actionLink);
  const html = brandedEmailHtml(
    `<h1 style="margin:0 0 14px;color:#0D1B39;font-size:24px;line-height:1.25;">Reset your password</h1>
     <p style="margin:0 0 18px;">We received a request to reset the password for your CDS Space client account.</p>
     <a href="${safeLink}" style="display:inline-block;border-radius:10px;background:#0A4FE8;padding:12px 20px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;">Reset password</a>
     <p style="margin:20px 0 0;color:#69738D;font-size:13px;line-height:1.6;">Use this link only on a device you trust. CDS Space will never ask for your existing password by email, chat or phone. If you did not request this, ignore this email and your password will remain unchanged.</p>`,
    { eyebrow: "Account recovery", preheader: "Reset your CDS Space client account password securely." },
  );
  await sendEmail({
    to: input.email,
    subject: "Reset your CDS Space password",
    text: `Reset your CDS Space password using this secure link: ${input.actionLink}\n\nIf you did not request this, ignore this email.`,
    html,
    fromName: "CDS Space Security",
  });
}

export function maskClientEmail(email: string) {
  const [local, domain] = normalizeClientEmail(email).split("@");
  if (!local || !domain) return "your email address";
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}
