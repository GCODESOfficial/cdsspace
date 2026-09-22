import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const authLayout = read("src/app/(auth)/layout.tsx");
const brandPanel = read("src/components/layout/AuthBrandPanel.tsx");
const requestGuard = read("src/lib/security/request-guard.ts");
const workspaceInstructions = read("AGENTS.md");
const loginPage = read("src/app/(auth)/login/page.tsx");
const signupPage = read("src/app/(auth)/signup/page.tsx");
const loginForm = read("src/components/marketing/LoginForm.tsx");
const signupForm = read("src/components/marketing/SignUpForm.tsx");
const phoneInput = read("src/components/shared/PhoneInput.tsx");
const rootLayout = read("src/app/layout.tsx");

const brandUsesIdleCallback = brandPanel.includes("requestIdleCallback");

const contracts = [
  {
    ok: authLayout.includes('export const dynamic = "force-dynamic"')
      && authLayout.includes("export const revalidate = 0"),
    message: "Public auth gateways must not emit long-lived static HTML.",
  },
  {
    ok: !brandUsesIdleCallback || (
      brandPanel.includes('typeof window.requestIdleCallback === "function"')
      && brandPanel.includes("window.setTimeout(run, 250)")
    ),
    message: "Auth hydration must provide a fallback when requestIdleCallback is unavailable.",
  },
  {
    ok: !brandUsesIdleCallback || (
      brandPanel.includes('typeof window.cancelIdleCallback === "function"')
      && brandPanel.includes("window.clearTimeout(handle)")
    ),
    message: "The auth idle fallback must clean up both idle callbacks and timers.",
  },
  {
    ok: loginPage.includes('@/components/marketing/LoginForm')
      && signupPage.includes('@/components/marketing/SignUpForm')
      && !loginPage.includes('@/components/marketing"')
      && !signupPage.includes('@/components/marketing"'),
    message: "Auth gateways must import their forms directly instead of loading the marketing barrel.",
  },
  {
    ok: !loginForm.includes("useSearchParams") && !signupForm.includes("useSearchParams"),
    message: "Auth forms must receive server-resolved query values so their first render is not hidden behind a client suspense boundary.",
  },
  {
    ok: !brandPanel.includes('@/lib/supabase') && !brandPanel.includes('@/lib/glashdb'),
    message: "The auth brand panel must not load the database client on the critical path.",
  },
  {
    ok: !phoneInput.includes("framer-motion") && !phoneInput.includes("country-flag-icons"),
    message: "The sign-up phone field must not load animation and full flag libraries on the auth critical path.",
  },
  {
    ok: !rootLayout.includes("AuthProvider"),
    message: "The public root must not load the legacy database-backed auth provider on every page.",
  },
  {
    ok: workspaceInstructions.includes("Public authentication gateways must not serve long-lived cached HTML"),
    message: "The permanent auth browser-compatibility rule is missing from AGENTS.md.",
  },
  {
    // A domain we own that is rejected by the host guard returns a bodyless 421
    // that no redirect can undo, and browsers render it as a failed page load.
    ok: requestGuard.includes('"cdsspace.com"') && requestGuard.includes('"www.cdsspace.com"'),
    message: "Owned non-canonical hosts must reach the app so their redirect to the canonical host can run.",
  },
];

const failures = contracts.filter((contract) => !contract.ok);
if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log(`Auth browser compatibility check passed (${contracts.length} contracts).`);
