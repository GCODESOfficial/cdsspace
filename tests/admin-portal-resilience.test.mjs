import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * "Admin portal temporarily unavailable" was a dead end: one slow or failed
 * database answer while verifying the session ended with a signed-in admin
 * staring at an error until they happened to tap again. These guards keep a
 * passing fault from locking anyone out of a portal they are signed in to.
 */
test("the session check retries before giving up", async () => {
  const route = await read("src/app/api/admin-check/route.ts");
  assert.match(route, /RESOLVE_ATTEMPTS/);
  assert.match(route, /isTransientDatabaseError/);
  // A schema fault is permanent and must not be retried forever.
  assert.match(route, /42P01/);
});

test("a database fault never demotes a signed-in admin", async () => {
  const route = await read("src/app/api/admin-check/route.ts");
  // Refreshing permissions may fail; the signed cookie still proves the session.
  assert.match(route, /if \(isTransientDatabaseError\(error\)\) return \{ \.\.\.session/);
  assert.match(route, /const cookieOnly = getAdminSession\(req\);/);
});

test("both portals reconnect on their own", async () => {
  const [admin, team] = await Promise.all([
    read("src/app/admin/layout.tsx"),
    read("src/app/team/layout.tsx"),
  ]);
  for (const source of [admin, team]) {
    assert.match(source, /reconnecting automatically/);
    assert.match(source, /if \(!sessionUnavailable\) return;/);
    assert.match(source, /visibilitychange/);
    assert.match(source, /"online"/);
  }
});

test("a verified team session survives a database outage", async () => {
  const auth = await read("src/lib/team-auth.ts");
  assert.match(auth, /SESSION_OUTAGE_GRACE_MS/);
  assert.match(auth, /verifiedSessions\.set\(token/);
  // Revocation must clear it rather than wait for the window to pass.
  assert.match(auth, /verifiedSessions\.delete\(token\)/);
  const logout = await read("src/app/api/team/logout/route.ts");
  assert.match(logout, /forgetCachedTeamSession\(token\)/);
});

test("a client is never signed out by a database hiccup", async () => {
  const [account, layout] = await Promise.all([
    read("src/lib/client-account.ts"),
    read("src/app/(dashboard)/layout.tsx"),
  ]);
  assert.match(account, /isTransientAccountError/);
  assert.match(account, /status: "unavailable"/);
  // The layout must tell the two apart rather than redirecting on both.
  assert.match(layout, /loaded\.status === "unavailable"/);
  assert.match(layout, /<PortalUnavailable \/>/);
});
