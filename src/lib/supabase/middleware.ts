import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Refresh the auth token
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Protect dashboard-related routes
    const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard') || 
                            request.nextUrl.pathname.startsWith('/subscription') || 
                            request.nextUrl.pathname.startsWith('/partnership');

    if (isDashboardRoute && !user) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('next', request.nextUrl.pathname)
        return NextResponse.redirect(loginUrl)
    }

    // Redirect logged-in users away from auth pages
    if (
        (request.nextUrl.pathname.startsWith('/login') ||
            request.nextUrl.pathname.startsWith('/signup')) &&
        user
    ) {
        const next = request.nextUrl.searchParams.get('next') || '/dashboard'
        return NextResponse.redirect(new URL(next, request.url))
    }

    return supabaseResponse
}
