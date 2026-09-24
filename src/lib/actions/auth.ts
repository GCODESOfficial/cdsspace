'use server'

import {
    completeClientEmailVerification,
    consumeClientEmailVerification,
    consumeClientSignupCode,
    findPendingClientVerification,
    issueClientEmailVerification,
    issueClientSignupVerification,
} from '@/lib/client-email-verification'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { clearClientDashboardSessionCookie, setClientDashboardSessionCookie } from '@/lib/client-dashboard-session'
import { clearMarketerDashboardSessionCookie } from '@/lib/marketer-dashboard-session'
import { validateClientAccountInvite } from '@/lib/client-directory-server'
import { glashMaybeOne, glashQuery } from '@/lib/glashdb/postgres'
import { signupSchema } from '@/lib/validations/auth'
import { resendClientLoginChallenge, startClientLogin, verifyClientLoginChallenge } from '@/lib/client-login-flow'
import { revokeAllClientMobileSessions } from '@/lib/client-mobile-session'
import { verifyNewAccountEmail } from '@/lib/email-verification-policy'
import {
    CLIENT_LOGIN_BINDING_COOKIE,
    CLIENT_LOGIN_OTP_TTL_MINUTES,
    CLIENT_SIGNUP_RESEND_SECONDS,
    clearClientLoginFailures,
    clientRequestContext,
    consumeSecurityRateLimit,
    normalizeClientEmail,
    sendClientSignupVerification,
    sendClientPasswordReset,
    verifyBotProtection,
} from '@/lib/client-login-security'
import { getGlashDbAdmin } from '@/lib/glashdb'
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from '@/lib/security/email-blocklist'
import { publicSiteOrigin } from '@/lib/public-site'

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
    if (process.env.NODE_ENV === 'production') return publicSiteOrigin();
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
    const { result, binding } = await startClientLogin(formData);
    if (binding) {
        const store = await cookies();
        store.set(CLIENT_LOGIN_BINDING_COOKIE, binding, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: CLIENT_LOGIN_OTP_TTL_MINUTES * 60,
        });
    }
    return result
}

export async function verifyClientLoginOtp(input: { challengeId: string; otp: string }) {
    const store = await cookies();
    const binding = store.get(CLIENT_LOGIN_BINDING_COOKIE)?.value || '';
    const result = await verifyClientLoginChallenge({ ...input, binding });
    if (!result.success) return result
    store.delete(CLIENT_LOGIN_BINDING_COOKIE);
    await Promise.all([
        setClientDashboardSessionCookie(result.user),
        clearMarketerDashboardSessionCookie(),
    ]);
    return { ...result, user: undefined, profile: undefined }
}

export async function resendClientLoginOtp(input: { challengeId: string }) {
    const store = await cookies();
    const binding = store.get(CLIENT_LOGIN_BINDING_COOKIE)?.value || '';
    return resendClientLoginChallenge({ ...input, binding })
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

    const alreadyVerified = await glashMaybeOne<{ id: string }>(
        'select id from public.profiles where lower(email) = $1 and email_verified_at is not null limit 1',
        [deliverableEmail.email],
    );
    if (alreadyVerified) {
        // Do not disclose account existence through the public sign-up form.
        return { success: true, resendInSeconds: CLIENT_SIGNUP_RESEND_SECONDS }
    }

    // Created unconfirmed through the admin API, which sends no GlashDB email
    // of its own. The branded CDS Space link below is the only way in, and
    // following it confirms the account through the admin API.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accountAdmin = getGlashDbAdmin() as any;
    const signup = await accountAdmin.auth.admin.createUser({
        email: deliverableEmail.email,
        password: validated.data.password,
        email_confirm: false,
        user_metadata: {
            full_name: validated.data.fullName,
            phone_number: validated.data.phoneNumber,
            company_name: validated.data.companyName,
            client_invite_id: invite?.id || null,
        },
    });

    let userId = signup.data?.user?.id || null;
    if (signup.error || !userId) {
        // The address already has an account that was never verified: send a
        // fresh link for that account instead of failing.
        const pending = await findPendingClientVerification(deliverableEmail.email);
        if (!pending) {
            return { error: 'We could not create the account. Please try again, or sign up with Google.' }
        }
        userId = pending.user_id;
        if (invite) {
            const existingUser = await accountAdmin.auth.admin.getUserById(userId).catch(() => ({ data: null }));
            const existingMetadata = existingUser.data?.user?.user_metadata || {};
            const patched = await accountAdmin.auth.admin.updateUserById(userId, {
                user_metadata: { ...existingMetadata, client_invite_id: invite.id },
            }).catch((error: unknown) => ({ error }));
            if (patched?.error) {
                return { error: 'We could not attach this invitation to the pending account. Please try again.' }
            }
        }
    }

    let issued: Awaited<ReturnType<typeof issueClientSignupVerification>>;
    try {
        issued = await issueClientSignupVerification({ userId, email: deliverableEmail.email, nextPath, siteUrl });
    } catch {
        return { error: 'We could not prepare the verification email. Please try again.' }
    }

    try {
        await sendClientSignupVerification({
            email: deliverableEmail.email,
            name: validated.data.fullName,
            actionLink: issued.link,
            code: issued.code,
        });
    } catch {
        // The account exists but its owner can never be told how to verify
        // it. Remove it so the address can be used again.
        if (signup.data?.user?.id) {
            await accountAdmin.auth.admin.deleteUser(signup.data.user.id).catch(() => undefined);
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
        message: 'If this address has a pending CDS Space account, a new code has been sent.',
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
    const pending = await findPendingClientVerification(deliverableEmail.email);
    if (!pending) return generic;

    try {
        const issued = await issueClientSignupVerification({
            userId: pending.user_id,
            email: deliverableEmail.email,
            nextPath: getSafeNextPath(input.next || pending.next_path),
            siteUrl: getSiteUrl(),
        });
        await sendClientSignupVerification({ email: deliverableEmail.email, name: null, actionLink: issued.link, code: issued.code });
    } catch {
        return { error: 'The verification email could not be resent. Please try again.' }
    }
    return generic;
}

/**
 * Checks the six-digit code from the sign-up email. Only email/password
 * sign-ups get one: Google and LinkedIn have already proved the address.
 */
export async function verifyClientSignupCode(input: { email: string; code: string; next?: string | null }) {
    const email = normalizeClientEmail(input.email);
    const code = String(input.code || '').replace(/\D/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || !/^\d{6}$/.test(code)) {
        return { error: 'Enter the six-digit code from the email.' }
    }
    const context = await clientRequestContext();
    const blocked = await consumeSecurityRateLimit({
        bucket: 'client-signup-code-network',
        identifier: context.ipHash,
        limit: 30,
        windowSeconds: 15 * 60,
        blockSeconds: 15 * 60,
    });
    if (blocked) return { error: 'Too many attempts. Wait a few minutes and try again.' }

    const result = await consumeClientSignupCode(email, code).catch(() => null);
    if (!result) return { error: 'We could not check the code. Please try again.' }
    if (result.status === 'wrong') {
        return { error: `That code is incorrect. ${result.attemptsRemaining} ${result.attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining.` }
    }
    if (result.status === 'expired') {
        return { error: 'This code has expired or was replaced. Request a new code.', expired: true }
    }

    await completeClientEmailVerification(result.spent);
    const next = getSafeNextPath(input.next || result.spent.next_path);
    return { success: true, next: `/login?verified=1&next=${encodeURIComponent(next)}` }
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
        // GlashDB's own recovery link cannot be completed (its verify step
        // fails), so the reset is a CDS Space link that the server honours by
        // setting the password through the admin API. Only verified clients
        // have a profile, which is the account this looks up.
        const account = await glashMaybeOne<{ id: string }>(
            'select id from public.profiles where lower(email) = $1 and email_verified_at is not null limit 1',
            [email],
        );
        if (account) {
            const resetLink = await issueClientEmailVerification({
                userId: account.id,
                email,
                nextPath: '/login',
                siteUrl: getSiteUrl(),
                purpose: 'password_reset',
            });
            await sendClientPasswordReset({ email, actionLink: resetLink });
        }
    } catch {
        // Deliberately return the same response so account existence is never disclosed.
    }
    return generic;
}

export async function completeClientPasswordReset(input: { password: string; confirmPassword: string; token?: string | null }) {
    if (input.password !== input.confirmPassword || !validPassword(input.password)) {
        return { error: 'Use 8–128 characters with uppercase, lowercase, number and symbol.' }
    }
    // The link is the authority, not a session: GlashDB cannot issue one to a
    // recovering client. Spending the token here makes the link single-use.
    const spent = input.token ? await consumeClientEmailVerification(input.token, 'password_reset') : null;
    if (!spent) return { error: 'This reset link is invalid or expired. Request another reset link.' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = getGlashDbAdmin() as any;
    const { error } = await admin.auth.admin.updateUserById(spent.user_id, { password: input.password });
    if (error) return { error: 'The password could not be updated. Request another reset link.' }

    await Promise.all([
        clearClientLoginFailures(spent.email),
        glashQuery('delete from public.client_login_verifications where user_id = $1::uuid', [spent.user_id]),
        // A password reset signs every mobile device out.
        revokeAllClientMobileSessions(spent.user_id, 'password_reset'),
    ]);
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
