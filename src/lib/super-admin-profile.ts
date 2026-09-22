import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

let cachedProfileId: string | null | undefined;

export function superAdminEmailCandidates() {
  return Array.from(new Set([
    process.env.SUPER_ADMIN_EMAIL,
    process.env.NEXT_PUBLIC_ADMIN_EMAIL,
    "ceo@cdsspace.pro",
    "contact.cdsspace@gmail.com",
  ].map((email) => String(email || "").trim().toLowerCase()).filter(Boolean)));
}

/** Resolve the profile UUID used by the legacy admin notification bell. */
export async function getSuperAdminProfileId(): Promise<string | null> {
  if (cachedProfileId) return cachedProfileId;
  if (!supabaseAdmin) return null;

  const candidates = superAdminEmailCandidates();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .in("email", candidates);
  if (error) {
    console.error("[super-admin-profile] lookup failed:", error.message);
    return null;
  }

  const profilesByEmail = new Map<string, string>(
    (data || []).map((profile: { id: string; email: string | null }): [string, string] => [
      String(profile.email || "").trim().toLowerCase(),
      String(profile.id),
    ]),
  );
  const resolvedProfileId = candidates
    .map((email) => profilesByEmail.get(email))
    .find((profileId): profileId is string => Boolean(profileId)) || null;
  if (resolvedProfileId) cachedProfileId = resolvedProfileId;
  return resolvedProfileId;
}
