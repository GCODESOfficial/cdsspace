'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { ensureClientProfile } from '@/lib/client-account'
import { clearClientDashboardSessionCookie, setClientDashboardSessionCookie } from '@/lib/client-dashboard-session'
import { clearMarketerDashboardSessionCookie } from '@/lib/marketer-dashboard-session'
import { clientDashboardPath } from '@/lib/client-routes'
import { validateClientAccountInvite } from '@/lib/client-directory-server'
import { deliverClientWelcome } from '@/lib/client-welcome'
import { getVerifiedAuthUser } from '@/lib/glashdb/auth-user'
import { glashMaybeOne, glashQuery } from '@/lib/glashdb/postgres'
import { signupSchema } from '@/lib/validations/auth'
import { verifyNewAccountEmail } from '@/lib/email-verification-policy'
import {
    CLIENT_LOGIN_BINDING_COOKIE,
    CLIENT_LOGIN_MAX_ATTEMPTS,
    CLIENT_LOGIN_MAX_OTP_SENDS,
    CLIENT_LOGIN_OTP_RESEND_SECONDS,
    CLIENT_LOGIN_OTP_TTL_MINUTES,
    CLIENT_SIGNUP_RESEND_SECONDS,
    bindingMatches,
    clearClientLoginFailures,
    clientLoginOtpHash,
    clientLoginOtpMatches,
    clientRequestContext,
    consumeSecurityRateLimit,
    createClientLoginChallenge,
    createLoginBinding,
    generateClientEmailOtp,
    getClientLoginChallenge,
    isClientLoginLocked,
    maskClientEmail,
    normalizeClientEmail,
    recordClientLoginFailure,
    sendClientLoginOtp,
    sendClientSignupVerification,
    sendClientPasswordReset,
    verifyBotProtection,
} from '@/lib/client-login-security'
import { getGlashDbAdmin } from '@/lib/glashdb'
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from '@/lib/security/email-blocklist'

type AuthFormData = {
    email: string;
    password: string;
    fullName?: string;
    phoneNumber?: string;
    companyName?: string;
    next?: string | null;
    clientInvite?: string | null;
    botToken?: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validPassword(value: unknown) {
    const password = String(value || '');
    return password.length >= 8
        && password.length <= 128
        && /[A-Z]/.test(password)
        && /[a-z]/.test(password)
        && /[0-9]/.test(password)
        && /[^A-Za-z0-9]/.test(password);
}

function getSiteUrl() {
    // Use explicit env var if set, otherwise fall back based on environment
    if (process.env.NEXT_PUBLIC_SITE_URL) {
        return process.env.NEXT_PUBLIC_SITE_URL;
    }
    // Vercel deployment
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    // Default to localhost in development
    return 'http://localhost:3000';
}

function getSafeNextPath(next?: string | null) {
    return next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export async function login(formData: AuthFormData) {
    const email = normalizeClientEmail(formData.email);
    const password = String(formData.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || !password || password.length > 128) {
        return { error: 'Email or password is incorrect.' }
    }
    if (isBlockedEmail(email)) return { error: BLOCKED_EMAIL_MESSAGE }

    const context = await clientRequestContext();
    const human = await verifyBotProtection({ token: formData.botToken, remoteIp: context.ip, action: 'client_login' });
    if (!human) return { error: 'Security verification failed. Refresh the page and try again.' }

    const [networkBlocked, identityBurstBlocked] = await Promise.all([
        consumeSecurityRateLimit({ bucket: 'client-login-network', identifier: context.ipHash, limit: 30, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }),
        consumeSecurityRateLimit({ bucket: 'client-login-identity', identifier: email, limit: 12, windowSeconds: 15 * 60, blockSeconds: 15 * 60 }),
    ]);
    if (networkBlocked || identityBurstBlocked) {
        return { error: 'Too many sign-in requests. Use password recovery or try again later.', locked: true }
    }
    if (await isClientLoginLocked(email)) {
        return { error: 'This account requires a password reset after five unsuccessful sign-in attempts.', locked: true }
    }

    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        const failure = await recordClientLoginFailure(email);
        return failure.locked
            ? { error: 'Five unsuccessful attempts were reached. Reset your password to continue.', locked: true }
            : { error: `Email or password is incorrect. ${failure.attemptsRemaining} attempts remaining.` }
    }

    if (!data.user) {
        return { error: 'Sign in completed without a user session. Please try again.' }
    }

    if (!data.user.email || !(data.user.email_confirmed_at || data.user.confirmed_at)) {
        await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined)
        await clearClientDashboardSessionCookie()
        return { error: 'Verify your email address before signing in.' }
    }

    const profile = await ensureClientProfile(data.user)
    if (profile.account_status !== 'active') {
        await supabase.auth.signOut({ scope: 'global' })
        await clearClientDashboardSessionCookie()
        return { error: 'This CDS Space business account is closed. Contact support if you need help restoring access.' }
    }

    const nextPath = getSafeNextPath(formData.next);
    const binding = createLoginBinding();
    try {
        const otp = await generateClientEmailOtp(email);
        const challenge = await createClientLoginChallenge({
            userId: data.user.id,
            email,
            otp,
            binding,
            nextPath,
        });
        if (!challenge) throw new Error('Could not create login verification.');
        await sendClientLoginOtp({ email, name: profile.full_name, otp });
        const store = await cookies();
        store.set(CLIENT_LOGIN_BINDING_COOKIE, binding, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: CLIENT_LOGIN_OTP_TTL_MINUTES * 60,
        });
        return {
            requiresOtp: true,
            challengeId: challenge.id,
            maskedEmail: maskClientEmail(email),
            expiresInSeconds: CLIENT_LOGIN_OTP_TTL_MINUTES * 60,
            resendInSeconds: CLIENT_LOGIN_OTP_RESEND_SECONDS,
        }
    } catch {
        return { error: 'We could not send the sign-in code. Please try again.' }
    } finally {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
        await clearClientDashboardSessionCookie()
    }
}

export async function verifyClientLoginOtp(input: { challengeId: string; otp: string }) {
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

    const store = await cookies();
    const binding = store.get(CLIENT_LOGIN_BINDING_COOKIE)?.value || '';
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
    const { data, error } = await supabase.auth.verifyOtp({ email: challenge.email, token: otp, type: 'email' });
    if (error || !data.user) {
        await glashQuery('delete from public.client_login_verifications where id = $1::uuid', [challenge.id]);
        return { error: 'That code is no longer valid. Start the sign-in process again.', expired: true }
    }

    const profile = await ensureClientProfile(data.user);
    if (profile.account_status !== 'active') {
        await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
        await clearClientDashboardSessionCookie();
        return { error: 'This CDS Space business account is closed.' }
    }

    await Promise.all([
        clearClientLoginFailures(challenge.email),
        glashQuery('delete from public.client_login_verifications where user_id = $1::uuid', [challenge.user_id]),
        deliverClientWelcome(profile.id).catch((deliveryError) => {
            console.error('[client-welcome] login delivery failed', deliveryError)
        }),
    ]);
    store.delete(CLIENT_LOGIN_BINDING_COOKIE);
    await Promise.all([
        setClientDashboardSessionCookie(data.user),
        clearMarketerDashboardSessionCookie(),
    ]);
    return { success: true, next: clientDashboardPath(profile.public_user_id, getSafeNextPath(challenge.next_path)) }
}

export async function resendClientLoginOtp(input: { challengeId: string }) {
    const challengeId = String(input.challengeId || '');
    if (!UUID_PATTERN.test(challengeId)) return { error: 'Start the sign-in process again.' }
    const store = await cookies();
    const binding = store.get(CLIENT_LOGIN_BINDING_COOKIE)?.value || '';
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
        const otp = await generateClientEmailOtp(challenge.email);
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
    } catch {
        await glashQuery(
            "update public.client_login_verifications set resend_available_at = now() where id = $1::uuid",
            [challenge.id],
        ).catch(() => []);
        return { error: 'The verification email could not be sent. Try again.' }
    }
}

export async function signup(formData: AuthFormData) {
    const email = normalizeClientEmail(formData.email);
    if (isBlockedEmail(email)) return { error: BLOCKED_EMAIL_MESSAGE }
    const validated = signupSchema.safeParse({
        email,
        password: formData.password,
        fullName: formData.fullName,
        phoneNumber: formData.phoneNumber,
        companyName: formData.companyName,
    });
    if (!validated.success) {
        return { error: validated.error.issues[0]?.message || 'Review your account information.' }
    }
    const context = await clientRequestContext();
    const human = await verifyBotProtection({ token: formData.botToken, remoteIp: context.ip, action: 'client_signup' });
    if (!human) return { error: 'Security verification failed. Refresh the page and try again.' }
    const [networkBlocked, identityBlocked] = await Promise.all([
        consumeSecurityRateLimit({ bucket: 'client-signup-network', identifier: context.ipHash, limit: 8, windowSeconds: 60 * 60, blockSeconds: 60 * 60 }),
        consumeSecurityRateLimit({ bucket: 'client-signup-identity', identifier: email, limit: 4, windowSeconds: 24 * 60 * 60, blockSeconds: 60 * 60 }),
    ]);
    if (networkBlocked || identityBlocked) return { error: 'Too many account requests. Try again later.' }

    const deliverableEmail = await verifyNewAccountEmail(email);
    if (!deliverableEmail.ok) return { error: deliverableEmail.error }

    const siteUrl = getSiteUrl()
    const nextPath = getSafeNextPath(formData.next)
    const invite = formData.clientInvite
        ? await validateClientAccountInvite(formData.clientInvite, email)
        : null
    if (formData.clientInvite && !invite) {
        return { error: 'This client invitation is invalid, expired, or belongs to another email address.' }
    }

    // Generate and deliver the verification link ourselves so activation does
    // not depend on an auth-provider dashboard toggle or provider email theme.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = getGlashDbAdmin() as any;
    const existing = await glashMaybeOne<{ id: string; email_confirmed_at: string | null }>(
        'select id, email_confirmed_at from auth.users where lower(email) = $1 limit 1',
        [deliverableEmail.email],
    );
    if (existing?.email_confirmed_at) {
        // Do not disclose account existence through the public sign-up form.
        return { success: true, resendInSeconds: CLIENT_SIGNUP_RESEND_SECONDS }
    }

    const linkResult = existing
        ? await admin.auth.admin.generateLink({
            type: 'magiclink',
            email: deliverableEmail.email,
            options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}` },
        })
        : await admin.auth.admin.generateLink({
            type: 'signup',
            email: deliverableEmail.email,
            password: validated.data.password,
            options: {
                data: {
                    full_name: validated.data.fullName,
                    phone_number: validated.data.phoneNumber,
                    company_name: validated.data.companyName,
                    client_invite_id: invite?.id || null,
                },
                redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`,
            },
        });
    const actionLink = linkResult.data?.properties?.action_link;
    const createdUserId = existing ? null : linkResult.data?.user?.id;
    if (linkResult.error || !actionLink) {
        return { error: 'We could not prepare the verification email. Please try again.' }
    }

    try {
        await sendClientSignupVerification({
            email: deliverableEmail.email,
            name: validated.data.fullName,
            actionLink,
        });
    } catch {
        if (createdUserId) {
            await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined);
        }
        return { error: 'We could not deliver the verification email. Check the address and try again.' }
    }

    await clearClientDashboardSessionCookie();
    return { success: true, resendInSeconds: CLIENT_SIGNUP_RESEND_SECONDS }
}

export async function resendClientSignupVerification(input: { email: string; next?: string | null }) {
    const email = normalizeClientEmail(input.email);
    const generic = {
        success: true,
        message: 'If this address has a pending CDS Space account, a new verification link has been sent.',
        resendInSeconds: CLIENT_SIGNUP_RESEND_SECONDS,
    };
    if (isBlockedEmail(email)) return generic;
    const context = await clientRequestContext();
    const [networkBlocked, identityBlocked] = await Promise.all([
        consumeSecurityRateLimit({ bucket: 'client-signup-resend-network', identifier: context.ipHash, limit: 10, windowSeconds: 60 * 60, blockSeconds: 60 * 60 }),
        consumeSecurityRateLimit({ bucket: 'client-signup-resend-identity', identifier: email, limit: 3, windowSeconds: 60 * 60, blockSeconds: 60 * 60 }),
    ]);
    if (networkBlocked || identityBlocked) return generic;

    const deliverableEmail = await verifyNewAccountEmail(email);
    if (!deliverableEmail.ok) return generic;
    const pending = await glashMaybeOne<{ id: string; full_name: string | null }>(
        `select u.id, u.raw_user_meta_data->>'full_name' as full_name
           from auth.users u
          where lower(u.email) = $1 and u.email_confirmed_at is null
          limit 1`,
        [deliverableEmail.email],
    );
    if (!pending) return generic;

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin = getGlashDbAdmin() as any;
        const { data, error } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email: deliverableEmail.email,
            options: {
                redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(getSafeNextPath(input.next))}`,
            },
        });
        const actionLink = data?.properties?.action_link;
        if (error || !actionLink) return generic;
        await sendClientSignupVerification({ email: deliverableEmail.email, name: pending.full_name, actionLink });
    } catch {
        return { error: 'The verification email could not be resent. Please try again.' }
    }
    return generic;
}

export async function requestClientPasswordReset(input: { email: string; botToken?: string | null }) {
    const email = normalizeClientEmail(input.email);
    const generic = { success: true, message: 'If that email belongs to a CDS Space client account, a reset link has been sent.' };
    // Blocked addresses get the same generic answer as an unknown one.
    if (isBlockedEmail(email)) return generic;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return generic;

    const context = await clientRequestContext();
    const human = await verifyBotProtection({ token: input.botToken, remoteIp: context.ip, action: 'password_reset' });
    if (!human) return { error: 'Security verification failed. Refresh the page and try again.' }
    const [networkBlocked, identityBlocked] = await Promise.all([
        consumeSecurityRateLimit({ bucket: 'password-reset-network', identifier: context.ipHash, limit: 8, windowSeconds: 60 * 60, blockSeconds: 60 * 60 }),
        consumeSecurityRateLimit({ bucket: 'password-reset-identity', identifier: email, limit: 3, windowSeconds: 60 * 60, blockSeconds: 60 * 60 }),
    ]);
    if (networkBlocked || identityBlocked) return generic;

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin = getGlashDbAdmin() as any;
        const { data, error } = await admin.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: `${getSiteUrl().replace(/\/$/, '')}/auth/recovery` },
        });
        const tokenHash = data?.properties?.hashed_token;
        if (!error && tokenHash) {
            // Keep the user-facing recovery link on the canonical CDS Space
            // origin. The fragment is not sent in HTTP requests or referrers;
            // the browser exchanges it directly with the auth provider.
            const recoveryLink = `${getSiteUrl().replace(/\/$/, '')}/auth/recovery#token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
            await sendClientPasswordReset({ email, actionLink: recoveryLink });
        }
    } catch {
        // Deliberately return the same response so account existence is never disclosed.
    }
    return generic;
}

export async function completeClientPasswordReset(input: { password: string; confirmPassword: string }) {
    if (input.password !== input.confirmPassword || !validPassword(input.password)) {
        return { error: 'Use 8–128 characters with uppercase, lowercase, number and symbol.' }
    }
    const supabase = await createClient();
    const user = await getVerifiedAuthUser(supabase.auth);
    if (!user?.email) return { error: 'This recovery session expired. Request another reset link.' }
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) return { error: 'The password could not be updated. Request another reset link.' }

    await Promise.all([
        clearClientLoginFailures(user.email),
        glashQuery('delete from public.client_login_verifications where user_id = $1::uuid', [user.id]),
    ]);
    await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
    await clearClientDashboardSessionCookie();
    return { success: true }
}

export async function oauthLogin(provider: 'google' | 'twitter' | 'facebook', next?: string) {
    const siteUrl = getSiteUrl()

    // Google uses a custom OAuth dance hosted on our own domain so the consent
    // screen reads "to continue to cdsspace.pro" instead of the GlashDB URL.
    if (provider === 'google') {
        const url = new URL(`${siteUrl}/api/auth/google/login`)
        if (next) url.searchParams.set('next', next)
        return { url: url.toString() }
    }

    // Twitter (X) and Facebook go through the GlashDB-compatible OAuth flow,
    // which redirects back to /auth/callback?code=... to exchange the code.
    if (provider === 'twitter' || provider === 'facebook') {
        const supabase = await createClient()
        const redirectTo = new URL(`${siteUrl}/auth/callback`)
        if (next) redirectTo.searchParams.set('next', next)
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: redirectTo.toString() },
        })
        if (error) return { error: error.message }
        if (data?.url) return { url: data.url }
        return { error: 'Failed to initiate OAuth flow' }
    }

    return { error: 'Unsupported provider' }
}

export async function logout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    await Promise.all([
        clearClientDashboardSessionCookie(),
        clearMarketerDashboardSessionCookie(),
    ])
}
