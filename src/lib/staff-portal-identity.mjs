/**
 * Compare the authenticated admin identity with a destination team session.
 * A stable member ID is authoritative when present. Normalized email exists
 * only for one-day legacy admin cookies issued before member IDs were stored.
 *
 * @param {{ role: "super_admin" | "sub_admin", memberId?: string, email: string }} admin
 * @param {{ id: string, email: string, is_sub_admin?: boolean }} team
 * @param {string} superAdminEmail
 */
export function sameStaffPortalIdentity(admin, team, superAdminEmail) {
  if (admin.role === "super_admin") {
    return normalizeEmail(team.email) === normalizeEmail(superAdminEmail);
  }
  if (admin.memberId) return admin.memberId === team.id;
  return normalizeEmail(admin.email) === normalizeEmail(team.email);
}

/**
 * @param {{ role: "super_admin" | "sub_admin", memberId?: string, email: string }} admin
 * @param {{ id: string, email: string, is_sub_admin?: boolean } | null | undefined} team
 * @param {string} superAdminEmail
 */
export function canReuseStaffPortalSession(admin, team, superAdminEmail) {
  return Boolean(
    team?.is_sub_admin
    && sameStaffPortalIdentity(admin, team, superAdminEmail),
  );
}

/** @param {string | null | undefined} value */
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
