#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = process.env.GLASH_API_URL || "https://api.glashdb.com/api";
const dry = process.argv.includes("--dry");
const runOnce = process.argv.includes("--run");

const WORKFLOW = {
  name: "Team session cutoff (18:15 WAT)",
  trigger: "cron",
  // Lagos is UTC+1 throughout the year, so 18:15 WAT is 17:15 UTC.
  schedule: "15 17 * * *",
  steps: [{ type: "http", method: "GET", url: "https://cdsspace.pro/api/cron/team-session-cutoff" }],
  enabled: true,
};

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Could not read ${label}.`);
  }
}

const { token } = readJson(join(homedir(), ".glash", "credentials.json"), "the GlashDB login");
const { projectId } = readJson(join(process.cwd(), ".glash", "project.json"), "the linked GlashDB project");

async function call(method, route, body) {
  const response = await fetch(`${API}/projects/${projectId}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route} returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

if (dry) {
  console.log(JSON.stringify({ projectId, workflow: WORKFLOW }, null, 2));
  process.exit(0);
}

try {
  const workflows = (await call("GET", "/workflows")) || [];
  const existing = workflows.find((workflow) => workflow.name === WORKFLOW.name);
  const saved = existing
    ? await call("PATCH", `/workflows/${existing.id}`, { schedule: WORKFLOW.schedule, steps: WORKFLOW.steps, enabled: true })
    : await call("POST", "/workflows", WORKFLOW);
  console.log(`${existing ? "Updated" : "Created"} ${saved.name}; schedule ${saved.schedule} UTC.`);
  if (runOnce) {
    const result = await call("POST", `/workflows/${saved.id}/run`);
    console.log(`Signed test run: ${result?.status || "completed"}`);
    if (!/→ 200/.test(String(result?.status || ""))) {
      throw new Error("The signed workflow test did not return HTTP 200.");
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
