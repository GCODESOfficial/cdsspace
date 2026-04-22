import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Read the cookie-based admin session set by POST /api/admin-login.
 * Returns { role, email, name, permissions } or null.
 */
async function readAdminSessionCookie(): Promise<
  | { role: "super_admin" | "sub_admin"; email: string; name?: string; permissions?: string[] }
  | null
> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("admin_session")?.value;
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session?.role === "super_admin" || session?.role === "sub_admin") return session;
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify the current request is from an authenticated admin (super_admin or sub_admin).
 * Recognises BOTH admin-portal sessions:
 *   1. The `admin_session` cookie set by /api/admin-login (primary).
 *   2. Legacy: a Supabase-auth session for ceo@cdsspace.pro.
 *
 * Returns { id, email, role } where `id` is the admin's profiles.id (used as
 * sender_id for chat inserts), or null if not authenticated.
 */
export async function verifyAdmin() {
  const cookieSession = await readAdminSessionCookie();
  if (cookieSession?.email && supabaseAdmin) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("email", cookieSession.email)
      .maybeSingle();

    let id = profile?.id as string | undefined;
    // Sub-admins may not have a profiles row — attribute their sends to the
    // super-admin profile so the FK holds and UI labels them as admin.
    if (!id) {
      const { data: superAdminProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", "ceo@cdsspace.pro")
        .maybeSingle();
      id = superAdminProfile?.id as string | undefined;
    }

    return {
      id: id || cookieSession.email,
      email: cookieSession.email,
      role: cookieSession.role,
    };
  }

  // Legacy path: Supabase-auth session for the super-admin email.
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  if (user.email !== "ceo@cdsspace.pro") return null;
  return user;
}

/**
 * Verify the current user is authenticated (any role).
 * Returns { user, supabase } or null.
 */
export async function verifyUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;

  return { user, supabase };
}
