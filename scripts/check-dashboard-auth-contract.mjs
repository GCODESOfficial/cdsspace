import { readFileSync } from "node:fs";

const requiredContracts = [
  {
    file: "src/lib/glashdb/middleware.ts",
    text: "const hasClientIdentity = Boolean(dashboardSession?.subject);",
    message: "Client navigation must trust the valid first-party session without pairing it to an upstream provider refresh.",
  },
  {
    file: "src/lib/client-dashboard-session.ts",
    text: "return claims ? clientDashboardSessionUser(claims) : null;",
    message: "Client account resolution must restore its principal from the signed first-party session.",
  },
  {
    file: "src/lib/marketer-account.ts",
    text: "readMarketerDashboardSessionUser(db.auth)",
    message: "Marketer pages must use the durable marketer dashboard session.",
  },
  {
    file: "src/lib/team-auth.ts",
    text: "team_device_sessions",
    message: "Team pages must retain their revocable first-party device session.",
  },
  {
    file: "src/lib/admin-session.ts",
    text: "verifyAdminCookie",
    message: "Admin pages must retain their signed first-party session.",
  },
  {
    file: "AGENTS.md",
    text: "Dashboard authentication invariant:",
    message: "The permanent workspace authentication rule is missing.",
  },
  {
    file: "src/app/admin/layout.tsx",
    text: "if (isChecking && !isAuthed)",
    message: "The admin shell may only be replaced while establishing the initial session, not during route changes.",
  },
  {
    file: "src/app/admin/layout.tsx",
    text: "const isRoutePending = validatedPathname !== pathname",
    message: "Admin route revalidation must be represented inside the persistent content region.",
  },
  {
    file: "src/components/admin/AdminSidebar.tsx",
    text: "{renderSidebarContent()}",
    message: "The desktop sidebar content must retain a stable React subtree across pathname updates.",
  },
  {
    file: "AGENTS.md",
    text: "Staff portal switching invariant:",
    message: "The permanent team/admin portal-switching rule is missing.",
  },
  {
    file: "src/app/api/admin/team-bridge/route.ts",
    text: "canReuseStaffPortalSession(admin, existingTeam, SUPER_ADMIN_EMAIL)",
    message: "Admin-to-team switching must reuse only a same-identity team session.",
  },
  {
    file: "src/app/api/admin/team-bridge/route.ts",
    text: "resolveAdminTeamMember(admin)",
    message: "Admin-to-team switching must resolve active team members with admin access.",
  },
  {
    file: "src/app/api/admin-check/route.ts",
    text: "response.cookies.set(\"admin_session\"",
    message: "Team-to-admin switching must establish the compatible signed admin session.",
  },
  {
    file: "src/app/api/admin-check/route.ts",
    text: "and is_sub_admin = true",
    message: "Bridged admin sessions must revalidate current team-member admin access.",
  },
  {
    file: "src/app/team/layout.tsx",
    text: "fetch(\"/api/admin/team-bridge\"",
    message: "The team shell must complete the admin-to-team handoff before redirecting to login.",
  },
  {
    file: "src/app/api/team/logout/route.ts",
    text: "res.cookies.set(\"admin_session\"",
    message: "Explicit team logout must also clear the bridged admin session.",
  },
  {
    file: "src/components/marketing/Hero.tsx",
    text: "href=\"/login\"",
    message: "The landing-page My account action must begin at the client login gateway.",
  },
  {
    file: "src/components/layout/Navbar.tsx",
    text: "const accountHref = \"/login\";",
    message: "The navigation My account action must begin at the client login gateway.",
  },
  {
    file: "src/app/(dashboard)/dashboard/page.tsx",
    text: "dashboardPath(\"/dashboard/book-session\")",
    message: "Client session booking must navigate to its dedicated dashboard page.",
  },
  {
    file: "src/app/(dashboard)/dashboard/book-session/page.tsx",
    text: "Back to previous page",
    message: "The dedicated client booking page must provide a return control.",
  },
  {
    file: "src/app/[username]/dashboard/book-session/page.tsx",
    text: "ScopedBookSessionPage",
    message: "The booking page must remain available on scoped client dashboard URLs.",
  },
];

const failures = requiredContracts.flatMap(({ file, text, message }) => {
  const source = readFileSync(file, "utf8");
  return source.includes(text) ? [] : [`${file}: ${message}`];
});

if (failures.length > 0) {
  console.error("Dashboard authentication contract check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Dashboard authentication contract check passed.");
