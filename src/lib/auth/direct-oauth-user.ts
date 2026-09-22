import "server-only";

import type { User } from "@supabase/supabase-js";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { glashMaybeOne } from "@/lib/glashdb/postgres";
import type { ClientAuthProvider } from "@/lib/auth/client-account-connections";

type ExistingAuthUser = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  raw_user_meta_data: Record<string, unknown> | null;
};

export type DirectOAuthProfile = {
  provider: ClientAuthProvider;
  subject: string;
  email: string;
  name: string;
  givenName?: string;
  familyName?: string;
  picture: string;
};

/**
 * Resolve a verified direct-provider identity to GlashDB's stable auth user.
 * Different verified emails remain different auth users; explicit Account
 * Config linking is the only path that can route two identities to one client.
 */
export async function prepareDirectOAuthUser(profile: DirectOAuthProfile): Promise<User> {
  const existing = await glashMaybeOne<ExistingAuthUser>(
    `select id, email, email_confirmed_at, confirmed_at, created_at, updated_at, raw_user_meta_data
       from auth.users
      where lower(email) = $1
      limit 1`,
    [profile.email],
  );
  const existingMetadata = existing?.raw_user_meta_data && typeof existing.raw_user_meta_data === "object"
    ? existing.raw_user_meta_data
    : {};
  const subjectKey = `${profile.provider}_sub`;
  const metadata = {
    ...existingMetadata,
    provider: profile.provider,
    providers: Array.from(new Set([
      ...(Array.isArray(existingMetadata.providers) ? existingMetadata.providers.filter((value): value is string => typeof value === "string") : []),
      profile.provider,
    ])),
    [subjectKey]: profile.subject,
    full_name: String(existingMetadata.full_name || existingMetadata.name || profile.name || `${profile.givenName || ""} ${profile.familyName || ""}`.trim()),
    name: String(existingMetadata.name || existingMetadata.full_name || profile.name || `${profile.givenName || ""} ${profile.familyName || ""}`.trim()),
    avatar_url: String(existingMetadata.avatar_url || existingMetadata.picture || profile.picture || ""),
    picture: String(existingMetadata.picture || existingMetadata.avatar_url || profile.picture || ""),
  };

  if (existing) {
    const verifiedAt = existing.email_confirmed_at || existing.confirmed_at || new Date().toISOString();
    return {
      id: existing.id,
      aud: "authenticated",
      role: "authenticated",
      email: existing.email || profile.email,
      email_confirmed_at: verifiedAt,
      confirmed_at: verifiedAt,
      created_at: existing.created_at || verifiedAt,
      updated_at: existing.updated_at || verifiedAt,
      app_metadata: { provider: profile.provider, providers: [profile.provider] },
      user_metadata: metadata,
      identities: [],
      is_anonymous: false,
    } as User;
  }

  // generateLink creates the Glash auth row without emailing a magic link. The
  // provider has already verified control of the email in this callback.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getGlashDbAdmin() as any;
  const result = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
    options: { data: metadata },
  });
  if (result.error || !result.data?.user) {
    throw new Error("The CDS Space account could not be prepared.");
  }
  const created = result.data.user as User;
  const verifiedAt = created.email_confirmed_at || created.confirmed_at || new Date().toISOString();
  return {
    ...created,
    email: created.email || profile.email,
    email_confirmed_at: verifiedAt,
    confirmed_at: verifiedAt,
    app_metadata: { ...(created.app_metadata || {}), provider: profile.provider, providers: [profile.provider] },
    user_metadata: metadata,
  } as User;
}
