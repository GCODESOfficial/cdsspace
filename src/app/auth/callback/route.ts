import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    let code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        code = code.replace(/\/$/, '')
        const supabase = await createClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.user) {
            // Ensure profile exists for new users (Google OAuth)
            const user = data.user
            const { data: existingProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', user.id)
                .single()

            if (!existingProfile) {
                await supabase.from('profiles').insert({
                    id: user.id,
                    email: user.email,
                    full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
                    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
                    company_name: user.user_metadata?.company_name || '',
                    phone_number: user.user_metadata?.phone_number || '',
                })
            }

            // Redirect to dashboard
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin
            return NextResponse.redirect(`${siteUrl}${next}`)
        }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin
    return NextResponse.redirect(`${siteUrl}/login?error=auth_code_exchange_failed`)
}
