import "server-only";

import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { readClientDashboardSessionUser } from "@/lib/client-dashboard-session";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import { readClientMobileSession } from "@/lib/client-mobile-session";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";

type ProviderAuth = { auth: { getUser: () => Promise<{ data: { user: User | null } }> } };

/**
 * The reader of an Intelligence page. The GlashDB provider session is tried
 * first (as before); otherwise the signed client dashboard session, which is
 * what a signed-in client actually navigates with on the web and what the
 * mobile app sends as a Bearer token.
 */
export async function intelligenceViewer(supabase: unknown): Promise<User | null> {
  const { data } = await (supabase as ProviderAuth).auth.getUser();
  if (data?.user) return data.user as User;
  const user = await readClientDashboardSessionUser();
  if (!user) return null;
  // The dashboard session carries only the ID and email; comments and private
  // report requests show the reader's name, so take it from their profile.
  const profile = await glashMaybeOne<{ full_name: string | null }>(
    "select full_name from public.profiles where id = $1::uuid limit 1",
    [user.id],
  ).catch(() => null);
  return profile?.full_name ? { ...user, user_metadata: { ...user.user_metadata, full_name: profile.full_name } } : user;
}

/**
 * Client-side Intelligence mutations (comments, likes, tracking, private-link
 * access). Browsers must send a same-origin Origin header (CSRF protection);
 * the mobile app has no Origin but authenticates with a revocable Bearer token,
 * which a cross-site page cannot attach, so a valid token is accepted instead.
 */
export async function trustedClientMutation(req: NextRequest) {
  if (assertTrustedMutationOrigin(req)) return true;
  return Boolean(await readClientMobileSession());
}
