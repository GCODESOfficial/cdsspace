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

export async function oauthLogin(provider: 'google', next?: string) {
    // We host the entire Google OAuth dance on cdsspace.com so the consent
    // screen reads "to continue to cdsspace.com" instead of the Supabase
    // project URL. /api/auth/google/login generates state + nonce and
    // redirects to Google; /api/auth/google/callback exchanges the auth
    // code for an id_token and hands it to supabase.auth.signInWithIdToken.
    // Supabase still owns the session — Google just never sees the raw
    // Supabase URL.
    if (provider !== 'google') {
        return { error: 'Unsupported provider' }
    }
    const siteUrl = getSiteUrl()
    const url = new URL(`${siteUrl}/api/auth/google/login`)
    if (next) url.searchParams.set('next', next)
    return { url: url.toString() }
}

export async function logout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
}
