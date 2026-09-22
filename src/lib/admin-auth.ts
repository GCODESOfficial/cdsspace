import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { readClientDashboardSessionUser } from "@/lib/client-dashboard-session";
import { verifyAdminCookie } from "@/lib/admin-session-cookie";
import { getSuperAdminProfileId } from "@/lib/super-admin-profile";

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
    const session = verifyAdminCookie<{ role: "super_admin" | "sub_admin"; email: string; name?: string; permissions?: string[] }>(
      cookieStore.get("admin_session")?.value,
    );
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
    // Environment-authenticated admins may not have a profile under their
    // login email. Use the canonical notification profile so FK-backed admin
    // actions and the super-admin bell still resolve to the same identity.
    if (!id) id = (await getSuperAdminProfileId()) || undefined;

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
  // A provider session on its own is not enough for client APIs. The signed
  // dashboard gate is issued only after the direct-login email OTP succeeds
  // (or after the trusted OAuth finalisation route completes).
  const user = await readClientDashboardSessionUser(supabase.auth);
  if (!user) return null;

  if (supabaseAdmin) {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("account_status")
      .eq("id", user.id)
      .maybeSingle();
    if (error || (profile?.account_status && profile.account_status !== "active")) return null;
  }

  return { user, supabase };
}
