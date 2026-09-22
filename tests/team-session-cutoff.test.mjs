import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const policy = readFileSync("src/lib/team-session-policy.ts", "utf8");
const auth = readFileSync("src/lib/team-auth.ts", "utf8");
const shell = readFileSync("src/app/team/layout.tsx", "utf8");
const roster = readFileSync("src/app/api/admin/team-members/route.ts", "utf8");
const adminCookie = readFileSync("src/lib/admin-session-cookie.ts", "utf8");
const cron = readFileSync("scripts/glash-team-session-cutoff-setup.mjs", "utf8");

test("team sessions are compared with the most recent 18:15 Lagos cutoff", () => {
  assert.match(policy, /TIMEBOOK_SCHEDULE\.autoCheckoutMinutes/);
  assert.match(policy, /mostRecentTeamSessionCutoffIso/);
  assert.match(policy, /created < new Date\(mostRecentTeamSessionCutoffIso\(now\)\)\.getTime\(\)/);
});

test("team and sub-admin sessions enforce the same daily cutoff", () => {
  assert.match(auth, /sessionRequiresDailyLogout\(data\.session_created_at\)/);
  assert.match(adminCookie, /parsed\.role === "sub_admin" && sessionRequiresDailyLogout\(parsed\.issuedAt\)/);
});

test("the mounted team shell checks session validity every minute", () => {
  assert.match(shell, /window\.setInterval\(refresh, 60_000\)/);
  assert.match(shell, /loadSession\(true\)/);
  assert.match(shell, /router\.replace\("\/team\/login"\)/);
});

test("online presence requires recent activity instead of an unexpired month-long session", () => {
  assert.match(roster, /last_seen_at >= now\(\) - interval '5 minutes'/);
});

test("the Glash workflow runs the cutoff at 18:15 Lagos time", () => {
  assert.match(cron, /schedule: "15 17 \* \* \*"/);
  assert.match(cron, /\/api\/cron\/team-session-cutoff/);
});
