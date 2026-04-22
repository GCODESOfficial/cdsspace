'use server'

import { createClient } from '@/lib/supabase/server'

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

export async function login(formData: any) {
    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
    })

    if (error) {
        return { error: error.message }
    }

    return { success: true }
}

export async function signup(formData: any) {
    const supabase = await createClient()
    const siteUrl = getSiteUrl()

    const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
            data: {
                full_name: formData.fullName,
                phone_number: formData.phoneNumber,
                company_name: formData.companyName,
            },
            emailRedirectTo: `${siteUrl}/auth/callback?next=/dashboard`,
        },
    })

    if (error) {
        return { error: error.message }
    }

    return { success: true }
}

export async function oauthLogin(provider: 'google' | 'twitter' | 'facebook', next?: string) {
    const siteUrl = getSiteUrl()

    // Google uses a custom OAuth dance hosted on cdsspace.com so the consent
    // screen reads "to continue to cdsspace.com" instead of the Supabase URL.
    if (provider === 'google') {
        const url = new URL(`${siteUrl}/api/auth/google/login`)
        if (next) url.searchParams.set('next', next)
        return { url: url.toString() }
    }

    // Twitter (X) and Facebook go through Supabase's standard OAuth flow,
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
}
