import { createBrowserClient } from '@supabase/ssr'

// Singleton: every call in the browser shares one GoTrue client so the auth
// Web Lock ('sb-*-auth-token') isn't held by multiple instances racing to refresh.
// Without this cache, two callers would each register their own lock and one
// would steal the other's → "Lock broken by another request with the 'steal' option".
let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
    if (typeof window === 'undefined') {
        // On the server (e.g. React Server Components accidentally importing the
        // browser helper), fall through to a fresh instance — it has no storage
        // and therefore no lock.
        return createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
    }
    if (!browserClient) {
        browserClient = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
    }
    return browserClient
}
