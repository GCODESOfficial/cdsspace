import { createClient } from "@/lib/supabase/server";

/**
 * Verify the current user is an authenticated admin (staff).
 * Returns the user if admin, null otherwise.
 */
export async function verifyAdmin() {
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
