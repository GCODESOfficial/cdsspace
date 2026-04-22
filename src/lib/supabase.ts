import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Query-only anon client. Session handling is delegated to the SSR client in
// `@/lib/supabase/client.ts`, so this instance does NOT persist or refresh — if
// it did, it would compete with the SSR client for the same auth-token Web Lock
// and you'd see "Lock broken by another request with the 'steal' option".
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storageKey: "sb-anon-readonly",
  },
})

// Create a Supabase admin client with service role key for server-side operations
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null

// Non-nullable admin client for API routes (throws if service role key missing)
export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return supabaseAdmin;
}