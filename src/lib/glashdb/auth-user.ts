import type { User } from "@supabase/supabase-js";

/**
 * Resolve a cryptographically verified auth user.
 *
 * `getUser()` remains the primary path. `getClaims()` is a safe fallback when
 * the auth user endpoint is temporarily unavailable during a token refresh;
 * unlike trusting getSession() alone, the claims path verifies the JWT first.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getVerifiedAuthUser(auth: any): Promise<User | null> {
  const { data: userData, error: userError } = await auth.getUser();
  if (!userError && userData?.user) {
    const user = userData.user as User;
    return user.email && (user.email_confirmed_at || user.confirmed_at) ? user : null;
  }

  if (typeof auth.getClaims !== "function") return null;

  const { data: claimsData, error: claimsError } = await auth.getClaims();
  const subject = claimsData?.claims?.sub;
  if (claimsError || !subject) return null;

  const { data: sessionData } = await auth.getSession();
  const sessionUser = sessionData?.session?.user as User | undefined;
  if (
    sessionUser
    && sessionUser.id === subject
    && sessionUser.email
    && (sessionUser.email_confirmed_at || sessionUser.confirmed_at)
  ) return sessionUser;
  return null;
}
