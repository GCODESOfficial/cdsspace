#!/usr/bin/env node
/**
 * Registers the end-of-day report as a GlashDB cron workflow.
 *
 * GitHub Actions starts scheduled jobs late (the 23:59 WAT run was landing
 * around 01:40), so the trigger moves to GlashDB, whose Cloudflare cron fires
 * every minute. The workflow's HTTP step is signed by GlashDB with the
 * project's CRON_SECRET - the same value GlashDB injects into the deployment -
 * so no Authorization header is set here.
 *
 * Idempotent: an existing workflow with the same name is updated, not duplicated.
 *
 *   node scripts/glash-cron-setup.mjs          create/update, then run it once
 *   node scripts/glash-cron-setup.mjs --dry    show what would be sent
 *   node scripts/glash-cron-setup.mjs --no-run create/update without the test run
 *
 * Needs a `glash login` session (~/.glash/credentials.json) and the repo link
 * in .glash/project.json.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = process.env.GLASH_API_URL || "https://api.glashdb.com/api";
const dry = process.argv.includes("--dry");
const skipRun = process.argv.includes("--no-run");

const WORKFLOW = {
  name: "Daily report (23:59 WAT)",
  trigger: "cron",
  // GlashDB schedules are UTC. Lagos is UTC+1 all year, so 23:59 WAT is 22:59 UTC.
  schedule: "59 22 * * *",
  steps: [{ type: "http", method: "GET", url: "https://cdsspace.pro/api/cron/daily-report" }],
  enabled: true,
};

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error(`Could not read ${what} at ${path}.`);
    process.exit(1);
  }
}

const { token } = readJson(join(homedir(), ".glash", "credentials.json"), "the GlashDB login (run `glash login`)");
const { projectId } = readJson(join(process.cwd(), ".glash", "project.json"), "the project link");

async function call(method, path, body) {
  const response = await fetch(`${API}/projects/${projectId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    // Cloudflare 1101 = the router Worker threw; 1015 = rate limited. Both are
    // GlashDB-side, so say so rather than suggesting the request was wrong.
    const hint = /1101/.test(text) ? " (GlashDB router error - the API is down, try later)"
      : /1015/.test(text) ? " (rate limited by Cloudflare - wait a few minutes)" : "";
    throw new Error(`${method} ${path} -> HTTP ${response.status}${hint}: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}

if (dry) {
  console.log(`Project ${projectId}\nWould create or update:`, JSON.stringify(WORKFLOW, null, 2));
  process.exit(0);
}

try {
  const existing = (await call("GET", "/workflows")) || [];
  const match = existing.find((workflow) => workflow.name === WORKFLOW.name);

  const saved = match
    ? await call("PATCH", `/workflows/${match.id}`, { schedule: WORKFLOW.schedule, steps: WORKFLOW.steps, enabled: true })
    : await call("POST", "/workflows", WORKFLOW);
  console.log(`${match ? "Updated" : "Created"} "${saved.name}" (${saved.id}), schedule ${saved.schedule} UTC.`);

  if (!skipRun) {
    // Proves GlashDB can reach the endpoint and the signature is accepted. This
    // sends the report for the last completed day, so the desk gets one email.
    const result = await call("POST", `/workflows/${saved.id}/run`);
    console.log(`Test run: ${result?.status}`);
    if (!/→ 200/.test(String(result?.status))) {
      console.error("The endpoint did not return 200. A 401 means the deployment's CRON_SECRET differs from GlashDB's.");
      process.exit(1);
    }
  }

  console.log("\nNext: remove the `schedule:` trigger from .github/workflows/daily-report.yml so the report is not sent twice.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
