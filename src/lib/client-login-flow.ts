import "server-only";

// Client email-and-password sign-in, shared by the web (Server Actions in
// lib/actions/auth.ts, which keep the login binding in an HttpOnly cookie) and
// the mobile API (which returns the binding to the app and receives it back).
// The binding ties the emailed code to the device that entered the password.

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureClientProfile, isPasswordAccount } from '@/lib/client-account'
import { clearClientDashboardSessionCookie } from '@/lib/client-dashboard-session'
import { clientDashboardPath } from '@/lib/client-routes'
import { deliverClientWelcome } from '@/lib/client-welcome'
import { glashMaybeOne, glashQuery } from '@/lib/glashdb/postgres'
import {
    CLIENT_LOGIN_MAX_ATTEMPTS,
    CLIENT_LOGIN_MAX_OTP_SENDS,
    CLIENT_LOGIN_OTP_RESEND_SECONDS,
    CLIENT_LOGIN_OTP_TTL_MINUTES,
    bindingMatches,
    clearClientLoginFailures,
    clientLoginOtpHash,
    clientLoginOtpMatches,
    clientRequestContext,
    consumeSecurityRateLimit,
    createClientLoginChallenge,
    createLoginBinding,
    generateClientEmailOtp,
    redeemClientLoginSession,
    getClientLoginChallenge,
    isClientLoginLocked,
    maskClientEmail,
    normalizeClientEmail,
    recordClientLoginFailure,
    sendClientLoginOtp,
    verifyBotProtection,
} from '@/lib/client-login-security'
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from '@/lib/security/email-blocklist'

export type LoginInput = {
    email: string;
    password: string;
    next?: string | null;
    botToken?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Development only: one line per sign-in showing where the time went, e.g.
// "[client-login timing] checks 820ms, password 2.1s, profile 1.4s, challenge 300ms (total 4.6s)".
function loginTimer() {
    const started = Date.now();
    let last = started;
    const steps: string[] = [];
    const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);
    return {
        step(label: string) {
            const now = Date.now();
            steps.push(`${label} ${ms(now - last)}`);
            last = now;
        },
        done() {
            if (process.env.NODE_ENV !== 'production') {
                console.info(`[client-login timing] ${steps.join(', ')} (total ${ms(Date.now() - started)})`);
            }
        },
    };
}

function getSafeNextPath(next?: string | null) {
    return next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export async function startClientLogin(formData: LoginInput) {
    const email = normalizeClientEmail(formData.email);
    const password = String(formData.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || !password || password.length > 128) {
        return { result: { error: 'Email or password is incorrect.' } }
    }
    if (isBlockedEmail(email)) return { result: { error: BLOCKED_EMAIL_MESSAGE } }

    const timer = loginTimer();
    try {
        return await startClientLoginTimed(email, password, formData, timer);
    } finally {
        timer.done();
    }
}

async function startClientLoginTimed(email: string, password: string, formData: LoginInput, timer: ReturnType<typeof loginTimer>) {
    const context = await clientRequestContext();
    // Independent database checks run together (each is a round trip to the
    // remote database); their answers are still applied in this order.
    const [human, networkBlocked, identityBurstBlocked, locked] = await Promise.all([
        verifyBotProtection({ token: formData.botToken, remoteIp: context.ip, action: 'client_login' }),
        consumeSecurityRateLimit({ bucket: 'client-login-network', identifier: context.ipHash, limit: 30, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }),
        consumeSecurityRateLimit({ bucket: 'client-login-identity', identifier: email, limit: 12, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }),
        isClientLoginLocked(email),
    ]);
    timer.step('checks');
    if (!human) return { result: { error: 'Security verification failed. Refresh the page and try again.' } }
    if (networkBlocked || identityBurstBlocked) {
        return { result: { error: 'Too many sign-in requests. Use password recovery or try again later.', locked: true } }
    }
    if (locked) {
        return { result: { error: 'This account requires a password reset after five unsuccessful sign-in attempts.', locked: true } }
    }

    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })
    timer.step('password')

    if (error) {
        // GlashDB refuses accounts it never confirmed with "email not verified".
        // That is not a wrong password, so it must not count toward the
        // five-attempt lockout or tell the owner their password is incorrect.
        if (/not (verified|confirmed)/i.test(error.message || '')) {
            return { result: { error: 'This email is not verified yet. Sign up again with the same email to receive a new verification code.', unverified: true } }
        }
        const failure = await recordClientLoginFailure(email);
        return { result: failure.locked
            ? { error: 'Five unsuccessful attempts were reached. Reset your password to continue.', locked: true }
            : { error: `Email or password is incorrect. ${failure.attemptsRemaining} attempts remaining.` } }
    }

    if (!data.user) {
        return { result: { error: 'Sign in completed without a user session. Please try again.' } }
    }

    // GlashDB now confirms every password account on creation, so its flag no
    // longer proves the address. The CDS Space verification link does, and it
    // is checked before any profile is created or any admin is notified.
    if (!data.user.email) {
        await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined)
        await clearClientDashboardSessionCookie()
        return { result: { error: 'Verify your email address before signing in.' } }
    }
    if (isPasswordAccount(data.user)) {
        const verified = await glashMaybeOne<{ id: string }>(
            'select id from public.profiles where id = $1 and email_verified_at is not null limit 1',
            [data.user.id],
        );
        if (!verified) {
            await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined)
            await clearClientDashboardSessionCookie()
            return { result: { error: 'Verify your email address before signing in. Sign up again with the same email to receive a new verification code.', unverified: true } }
        }
    }

    const profile = await ensureClientProfile(data.user)
    timer.step('profile')
    if (profile.account_status !== 'active') {
        await supabase.auth.signOut({ scope: 'global' })
        await clearClientDashboardSessionCookie()
        return { result: { error: profile.account_status === 'suspended'
            ? 'This CDS Space business account is temporarily suspended. Use a previously connected social sign-in or contact support to restore access.'
            : 'This CDS Space business account is closed. Contact support if you need help restoring access.' } }
    }

    const nextPath = getSafeNextPath(formData.next);
    const binding = createLoginBinding();
    try {
        const otp = generateClientEmailOtp();
        const challenge = await createClientLoginChallenge({
            userId: data.user.id,
            email,
            otp,
            binding,
            nextPath,
        });
        if (!challenge) throw new Error('Could not create login verification.');
        timer.step('challenge');
        // Sent after the response so the person isn't kept waiting on the mail
        // server (often several seconds). If it fails, Resend issues a new code.
        after(() => sendClientLoginOtp({ email, name: profile.full_name, otp }).catch((sendError: unknown) => {
            console.error('[client-login] sign-in code email failed:', sendError instanceof Error ? sendError.message : sendError);
        }));
        return { binding, result: {
            requiresOtp: true,
            challengeId: challenge.id,
            maskedEmail: maskClientEmail(email),
            expiresInSeconds: CLIENT_LOGIN_OTP_TTL_MINUTES * 60,
            resendInSeconds: CLIENT_LOGIN_OTP_RESEND_SECONDS,
        } }
    } catch (error) {
        console.error('[client-login] sign-in code step failed:', error instanceof Error ? error.message : error);
        return { result: { error: 'We could not send the sign-in code. Please try again.' } }
    } finally {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
        await clearClientDashboardSessionCookie()
    }
}

export async function verifyClientLoginChallenge(input: { challengeId: string; otp: string; binding: string }) {
    const challengeId = String(input.challengeId || '');
    const otp = String(input.otp || '').replace(/\D/g, '').slice(0, 6);
    if (!UUID_PATTERN.test(challengeId) || !/^\d{6}$/.test(otp)) {
        return { error: 'Enter the six-digit code.' }
    }

    const context = await clientRequestContext();
    const blocked = await consumeSecurityRateLimit({
        bucket: 'client-login-otp-network',
        identifier: context.ipHash,
        limit: 30,
        windowSeconds: 15 * 60,
        blockSeconds: 15 * 60,
    });
    if (blocked) return { error: 'Too many verification attempts. Start the sign-in process again.' }

    const binding = String(input.binding || '');
    const challenge = await getClientLoginChallenge(challengeId);
    if (!challenge || !binding || !bindingMatches(challenge.browser_binding_hash, binding)) {
        return { error: 'This sign-in verification is no longer valid. Start again.' }
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        await glashQuery('delete from public.client_login_verifications where id = $1::uuid', [challenge.id]);
        return { error: 'That code has expired. Start the sign-in process again.', expired: true }
    }
    if (challenge.attempts >= CLIENT_LOGIN_MAX_ATTEMPTS) {
        await glashQuery('delete from public.client_login_verifications where id = $1::uuid', [challenge.id]);
        return { error: 'Too many incorrect codes. Start the sign-in process again.', expired: true }
    }
    if (!clientLoginOtpMatches(challenge.otp_hash, challenge.user_id, challenge.email, otp)) {
        const nextAttempts = Number(challenge.attempts || 0) + 1;
        if (nextAttempts >= CLIENT_LOGIN_MAX_ATTEMPTS) {
            await glashQuery('delete from public.client_login_verifications where id = $1::uuid', [challenge.id]);
        } else {
            await glashQuery(
                'update public.client_login_verifications set attempts = $2, updated_at = now() where id = $1::uuid',
                [challenge.id, nextAttempts],
            );
        }
        return {
            error: nextAttempts >= CLIENT_LOGIN_MAX_ATTEMPTS
                ? 'Too many incorrect codes. Start the sign-in process again.'
                : 'That code is incorrect.',
            attemptsRemaining: Math.max(0, CLIENT_LOGIN_MAX_ATTEMPTS - nextAttempts),
            expired: nextAttempts >= CLIENT_LOGIN_MAX_ATTEMPTS,
        }
    }

    const supabase = await createClient();
    const { data, error } = await redeemClientLoginSession(supabase, challenge.email)
        .catch((redeemError: unknown) => {
            console.error('[client-login] session step failed:', redeemError instanceof Error ? redeemError.message : redeemError);
            return { data: { user: null }, error: redeemError };
        });
    if (error || !data.user) {
        await glashQuery('delete from public.client_login_verifications where id = $1::uuid', [challenge.id]);
        return { error: 'That code is no longer valid. Start the sign-in process again.', expired: true }
    }

    const profile = await ensureClientProfile(data.user);
    if (profile.account_status !== 'active') {
        await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
        await clearClientDashboardSessionCookie();
        return { error: profile.account_status === 'suspended'
            ? 'This CDS Space business account is temporarily suspended.'
            : 'This CDS Space business account is closed.' }
    }

    await Promise.all([
        clearClientLoginFailures(challenge.email),
        glashQuery('delete from public.client_login_verifications where user_id = $1::uuid', [challenge.user_id]),
    ]);
    // The welcome email doesn't need to hold up the sign-in.
    after(() => deliverClientWelcome(profile.id).catch((deliveryError) => {
        console.error('[client-welcome] login delivery failed', deliveryError)
    }));
    return {
        success: true as const,
        user: data.user,
        profile,
        next: clientDashboardPath(profile.public_user_id, getSafeNextPath(challenge.next_path)),
    }
}

export async function resendClientLoginChallenge(input: { challengeId: string; binding: string }) {
    const challengeId = String(input.challengeId || '');
    if (!UUID_PATTERN.test(challengeId)) return { error: 'Start the sign-in process again.' }
    const binding = String(input.binding || '');
    const challenge = await getClientLoginChallenge(challengeId);
    if (!challenge || !binding || !bindingMatches(challenge.browser_binding_hash, binding)) {
        return { error: 'This sign-in verification is no longer valid. Start again.' }
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        return { error: 'This sign-in verification expired. Start again.', expired: true }
    }
    if (new Date(challenge.resend_available_at).getTime() > Date.now()) {
        return { error: 'Please wait before requesting another code.' }
    }
    if (challenge.send_count >= CLIENT_LOGIN_MAX_OTP_SENDS) {
        return { error: 'Too many codes were requested. Start again later.', expired: true }
    }

    try {
        const otp = generateClientEmailOtp();
        const expiresAt = new Date(Date.now() + CLIENT_LOGIN_OTP_TTL_MINUTES * 60_000);
        const resendAt = new Date(Date.now() + CLIENT_LOGIN_OTP_RESEND_SECONDS * 1_000);
        await glashQuery(
            `update public.client_login_verifications
                set otp_hash = $2, expires_at = $3, resend_available_at = $4,
                    attempts = 0, send_count = send_count + 1, updated_at = now()
              where id = $1::uuid`,
            [challenge.id, clientLoginOtpHash(challenge.user_id, challenge.email, otp), expiresAt.toISOString(), resendAt.toISOString()],
        );
        await sendClientLoginOtp({ email: challenge.email, otp });
        return {
            success: true,
            expiresInSeconds: CLIENT_LOGIN_OTP_TTL_MINUTES * 60,
            resendInSeconds: CLIENT_LOGIN_OTP_RESEND_SECONDS,
        }
    } catch (error) {
        console.error('[client-login] resend code step failed:', error instanceof Error ? error.message : error);
        await glashQuery(
            "update public.client_login_verifications set resend_available_at = now() where id = $1::uuid",
            [challenge.id],
        ).catch(() => []);
        return { error: 'The verification email could not be sent. Try again.' }
    }
}

