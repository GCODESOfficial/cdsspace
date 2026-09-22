import { strict as assert } from "node:assert";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// executive-board.ts reaches for the shared rate table through the "@/" alias,
// which Node cannot resolve on its own, so the module under test is bundled
// first. Same esbuild invocation the populate-prospects script uses.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "node_modules/.cache/executive-board.test.cjs");
mkdirSync(path.dirname(bundle), { recursive: true });
execFileSync("npx", [
  "--yes", "esbuild@0.24.0", "src/lib/executive-board.ts",
  "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`,
  "--alias:@=./src", "--alias:server-only=./scripts/server-only-stub.js",
  "--log-level=error",
], { cwd: root, stdio: "inherit" });

const { summariseTargets } = await import(bundle);

const target = (over = {}) => ({
  id: "t", title: "T", metric: "", unit: "USD", target_value: 0, current_value: 0,
  due_on: null, owner: null, model_id: null, status: "on_track", notes: null,
  source: "manual", period_month: null, created_at: "", updated_at: "", ...over,
});

test("adds up money targets and splits achieved from pending", () => {
  const summary = summariseTargets([
    target({ unit: "USD", target_value: 1000, current_value: 250 }),
    target({ unit: "USD", target_value: 3000, current_value: 750 }),
  ], "USD");
  assert.equal(summary.goal, 4000);
  assert.equal(summary.achieved, 1000);
  assert.equal(summary.pending, 3000);
  assert.equal(summary.progress, 25);
  assert.equal(summary.monetary, 2);
  assert.equal(summary.nonMonetary, 0);
});

test("converts every currency into the currency being viewed", () => {
  // 1 USD = 1600 NGN in the shared rate table.
  const summary = summariseTargets([
    target({ unit: "USD", target_value: 100, current_value: 50 }),
    target({ unit: "NGN", target_value: 160000, current_value: 80000 }),
  ], "USD");
  assert.equal(summary.goal, 200);
  assert.equal(summary.achieved, 100);
  assert.equal(summary.progress, 50);
});

test("leaves non-money targets out of the totals but still counts them", () => {
  const summary = summariseTargets([
    target({ unit: "USD", target_value: 1000, current_value: 500 }),
    target({ unit: "clients", target_value: 20, current_value: 5 }),
    target({ unit: "%", target_value: 90, current_value: 30 }),
  ], "USD");
  // A headcount must never be added to a sum of money.
  assert.equal(summary.goal, 1000);
  assert.equal(summary.achieved, 500);
  assert.equal(summary.monetary, 1);
  assert.equal(summary.nonMonetary, 2);
  assert.equal(summary.total, 3);
});

test("one target beating its goal cannot mask the rest falling short", () => {
  const summary = summariseTargets([
    target({ unit: "USD", target_value: 1000, current_value: 5000 }),
    target({ unit: "USD", target_value: 1000, current_value: 0 }),
  ], "USD");
  assert.equal(summary.goal, 2000);
  assert.equal(summary.achieved, 1000, "the overshoot is capped at its own goal");
  assert.equal(summary.pending, 1000);
  assert.equal(summary.progress, 50);
});

test("never divides by a zero goal, and never reports negative pending", () => {
  const summary = summariseTargets([target({ unit: "USD", target_value: 0, current_value: 0 })], "USD");
  assert.equal(summary.goal, 0);
  assert.equal(summary.progress, 0);
  assert.equal(summary.pending, 0);
});

test("counts the statuses shown on the summary card", () => {
  const summary = summariseTargets([
    target({ status: "achieved" }),
    target({ status: "on_track" }),
    target({ status: "at_risk" }),
    target({ status: "off_track" }),
  ], "USD");
  assert.equal(summary.achievedCount, 1);
  assert.equal(summary.onTrackCount, 1);
  assert.equal(summary.atRiskCount, 2, "at risk and off track both need attention");
});

test("an empty board is a zeroed summary, not a crash", () => {
  const summary = summariseTargets([], "NGN");
  assert.equal(summary.total, 0);
  assert.equal(summary.goal, 0);
  assert.equal(summary.progress, 0);
  assert.equal(summary.currency, "NGN");
});
