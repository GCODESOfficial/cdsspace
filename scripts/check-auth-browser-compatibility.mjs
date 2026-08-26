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

const contracts = [
  {
    ok: authLayout.includes('export const dynamic = "force-dynamic"')
      && authLayout.includes("export const revalidate = 0"),
    message: "Public auth gateways must not emit long-lived static HTML.",
  },
  {
    ok: brandPanel.includes('typeof window.requestIdleCallback === "function"')
      && brandPanel.includes("window.setTimeout(run, 250)"),
    message: "Auth hydration must provide a fallback when requestIdleCallback is unavailable.",
  },
  {
    ok: brandPanel.includes('typeof window.cancelIdleCallback === "function"')
      && brandPanel.includes("window.clearTimeout(handle)"),
    message: "The auth idle fallback must clean up both idle callbacks and timers.",
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
