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

