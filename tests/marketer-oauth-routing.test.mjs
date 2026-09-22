import { strict as assert } from "node:assert";
import test from "node:test";

/**
 * The rule that decides whether a social sign-in lands in the marketer portal
 * or the client dashboard. Google and LinkedIn do not set our `account_type`
 * metadata, so the signed destination must preserve the selected portal.
 * Mirrors finalizeClientOAuthSignIn.
 */
function wantsMarketerPortal(next) {
  return typeof next === "string" && (next === "/marketer" || next.startsWith("/marketer/"));
}

function routesToMarketer(user, next) {
  return user?.user_metadata?.account_type === "brand_marketer" || wantsMarketerPortal(next);
}

const socialUser = { user_metadata: { name: "A Marketer", picture: "https://x/y.png" } };
const formMarketer = { user_metadata: { account_type: "brand_marketer", full_name: "A Marketer" } };
const plainClient = { user_metadata: { full_name: "A Client" } };

test("Google and LinkedIn sign-ins started from the marketer portal land there", () => {
  assert.equal(routesToMarketer(socialUser, "/marketer"), true);
  assert.equal(routesToMarketer(socialUser, "/marketer/earnings"), true);
});

test("an account created through the marketer form still routes on its metadata", () => {
  // No destination at all, e.g. an email confirmation link.
  assert.equal(routesToMarketer(formMarketer, undefined), true);
  assert.equal(routesToMarketer(formMarketer, "/dashboard"), true);
});

test("an ordinary client social sign-in is untouched", () => {
  assert.equal(routesToMarketer(plainClient, "/dashboard"), false);
  assert.equal(routesToMarketer(plainClient, undefined), false);
  assert.equal(routesToMarketer(plainClient, null), false);
});

test("every destination the client pages actually send still routes to the client", () => {
  // LoginForm sends ?next= or "/dashboard"; SignUpForm sends the default.
  // A signed-in client is sent to their scoped dashboard path.
  for (const next of [
    "/dashboard",
    "/dashboard/invoices",
    "/ABC12345/dashboard",
    "/ABC12345/dashboard/subscription",
    "/dashboard/settings?tab=billing",
    undefined,
  ]) {
    assert.equal(routesToMarketer(plainClient, next), false, `${next} must stay on the client path`);
    assert.equal(routesToMarketer(socialUser, next), false, `${next} must stay on the client path`);
  }
});

test("a path that merely starts with the letters of marketer is not the portal", () => {
  // "/marketers-guide" is a marketing page, not the portal.
  assert.equal(wantsMarketerPortal("/marketersguide"), false);
  assert.equal(wantsMarketerPortal("/marketers-guide"), false);
  assert.equal(wantsMarketerPortal("/marketing"), false);
});

test("the destination cannot be used to reach another site", () => {
  // safeOAuthNext() in the shared OAuth route rejects these before they get here,
  // so the portal test never sees an absolute or protocol-relative URL.
  const safeNext = (raw) => (raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard");
  assert.equal(safeNext("https://evil.example/marketer"), "/dashboard");
  assert.equal(safeNext("//evil.example/marketer"), "/dashboard");
  assert.equal(safeNext("/marketer"), "/marketer");
});

test("LinkedIn login bypasses the failing Glash authorize adapter", async () => {
  const fs = await import("node:fs/promises");
  const [route, direct, callback, sharedUser] = await Promise.all([
    fs.readFile("src/app/api/auth/linkedin/login/route.ts", "utf8"),
    fs.readFile("src/lib/auth/linkedin-login.ts", "utf8"),
    fs.readFile("src/app/api/admin/content-hub/social/callback/[platform]/route.ts", "utf8"),
    fs.readFile("src/lib/auth/direct-oauth-user.ts", "utf8"),
  ]);
  assert.match(route, /startDirectLinkedInLogin/);
  assert.doesNotMatch(route, /startDashboardOAuth/);
  assert.match(direct, /https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization/);
  assert.match(direct, /openid profile email/);
  assert.match(direct, /validState/);
  assert.match(direct, /finalizeClientOAuthSignIn/);
  assert.doesNotMatch(direct, /\.updateUserById\(/);
  assert.match(direct, /prepareDirectOAuthUser/);
  assert.match(sharedUser, /generateLink/);
  assert.match(callback, /completeDirectLinkedInLogin/);
});
