import test from "node:test";
import assert from "node:assert/strict";
import {
  canReuseStaffPortalSession,
  sameStaffPortalIdentity,
} from "../src/lib/staff-portal-identity.mjs";

const superAdminEmail = "ceo@cdsspace.pro";

test("a stable team-member ID permits same-identity portal-session reuse", () => {
  const admin = { role: "sub_admin", memberId: "member-1", email: "old@example.com" };
  const team = { id: "member-1", email: "new@example.com", is_sub_admin: true };
  assert.equal(canReuseStaffPortalSession(admin, team, superAdminEmail), true);
});

test("a different stable team-member ID is rejected even when email matches", () => {
  const admin = { role: "sub_admin", memberId: "member-1", email: "same@example.com" };
  const team = { id: "member-2", email: "same@example.com", is_sub_admin: true };
  assert.equal(canReuseStaffPortalSession(admin, team, superAdminEmail), false);
});

test("normalized email remains a legacy fallback only without a member ID", () => {
  const admin = { role: "sub_admin", email: " ADMIN@Example.com " };
  const team = { id: "member-1", email: "admin@example.com", is_sub_admin: true };
  assert.equal(sameStaffPortalIdentity(admin, team, superAdminEmail), true);
});

test("a team member without current admin access cannot reuse the admin bridge", () => {
  const admin = { role: "sub_admin", memberId: "member-1", email: "admin@example.com" };
  const team = { id: "member-1", email: "admin@example.com", is_sub_admin: false };
  assert.equal(canReuseStaffPortalSession(admin, team, superAdminEmail), false);
});

test("the super-admin bridge only reuses the designated super-admin team identity", () => {
  const admin = { role: "super_admin", email: superAdminEmail };
  assert.equal(
    canReuseStaffPortalSession(
      admin,
      { id: "super-member", email: "CEO@CDSSPACE.PRO", is_sub_admin: true },
      superAdminEmail,
    ),
    true,
  );
  assert.equal(
    canReuseStaffPortalSession(
      admin,
      { id: "other-member", email: "other@example.com", is_sub_admin: true },
      superAdminEmail,
    ),
    false,
  );
});
