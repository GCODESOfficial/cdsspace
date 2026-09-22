import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = await Promise.all([
  readFile("src/lib/auth/client-account-connections.ts", "utf8"),
  readFile("src/lib/client-oauth.ts", "utf8"),
  readFile("src/app/api/auth/after-login/route.ts", "utf8"),
  readFile("src/app/api/auth/oauth/exchange/route.ts", "utf8"),
  readFile("src/lib/auth/linkedin-login.ts", "utf8"),
  readFile("src/app/api/client/account/connections/[provider]/connect/route.ts", "utf8"),
  readFile("src/app/(dashboard)/dashboard/settings/page.tsx", "utf8"),
  readFile("glashdb/migrations/20260916_client_auth_identities.sql", "utf8"),
]);

const [connections, finalizer, afterLogin, exchange, linkedIn, connectRoute, settings, migration] = files;

test("provider mappings are unique and belong to a stable client profile", () => {
  assert.match(migration, /references public\.profiles\(id\) on delete cascade/i);
  assert.match(migration, /unique \(provider, provider_subject\)/i);
  assert.match(migration, /unique \(client_user_id, provider\)/i);
  assert.match(migration, /enable row level security/i);
});

test("account linking requires both a signed intent and the active client session", () => {
  assert.match(connections, /createHmac/);
  assert.match(connections, /timingSafeEqual/);
  assert.match(connections, /verifyClientDashboardSession/);
  assert.match(connections, /intent\.clientUserId !== dashboardSession\.subject/);
  assert.match(connectRoute, /readClientDashboardSession/);
  assert.match(connectRoute, /setClientOAuthLinkCookie/);
});

test("Google callback paths complete linking before ordinary sign-in finalization", () => {
  for (const source of [afterLogin, exchange]) {
    assert.ok(source.indexOf("const linkAttempt = await completeClientOAuthLinkAttempt") < source.indexOf("const response = await finalizeClientOAuthSignIn"));
    assert.match(source, /clearClientOAuthLinkCookie/);
  }
});

test("direct LinkedIn callback completes linking before creating a dashboard session", () => {
  assert.ok(linkedIn.indexOf("const linkAttempt = await completeClientOAuthLinkAttempt") < linkedIn.indexOf("const finalized = await finalizeClientOAuthSignIn"));
  assert.match(linkedIn, /clearClientOAuthLinkCookie/);
});

test("normal social login resolves a connected identity and preserves separate unlinked entries", () => {
  assert.match(finalizer, /findLinkedClientIdentity/);
  assert.match(finalizer, /userForLinkedClient/);
  assert.match(finalizer, /recordProviderLogin/);
  assert.match(finalizer, /Unconnected provider identities keep their own profiles/);
});

test("Account Config presents separate Google and LinkedIn connection controls", () => {
  assert.match(settings, /Connected sign-in accounts/);
  assert.match(settings, /Connect \{label\}/);
  assert.match(settings, /does not merge documents, orders, invoices or other data/);
});

test("Google bypasses the failing Glash authorize adapter and keeps account selection explicit", async () => {
  const [route, direct, callbackPage, callbackRoute] = await Promise.all([
    readFile("src/app/api/auth/google/login/route.ts", "utf8"),
    readFile("src/lib/auth/google-login.ts", "utf8"),
    readFile("src/app/auth/callback/page.tsx", "utf8"),
    readFile("src/app/api/auth/google/callback/route.ts", "utf8"),
  ]);
  assert.match(route, /startDirectGoogleLogin/);
  assert.doesNotMatch(route, /startDashboardOAuth/);
  assert.match(direct, /https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(direct, /https:\/\/oauth2\.googleapis\.com\/token/);
  assert.match(direct, /prompt", "select_account"/);
  assert.match(direct, /code_challenge_method", "S256"/);
  assert.match(direct, /\/auth\/callback/);
  assert.match(callbackPage, /\/api\/auth\/google\/callback/);
  assert.match(callbackRoute, /completeDirectGoogleLogin/);
});
