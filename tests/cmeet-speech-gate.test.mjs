import { strict as assert } from "node:assert";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "node_modules/.cache/cmeet-gate.test.cjs");
mkdirSync(path.dirname(bundle), { recursive: true });
execFileSync("npx", [
  "--yes", "esbuild@0.24.0", "src/lib/cmeet-translation.ts",
  "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`,
  "--alias:@=./src", "--log-level=error",
], { cwd: root, stdio: "inherit" });

const { nextSpeechGateState } = await import(bundle);

const LOUD = 0.05;
const QUIET = 0.0001;
const HOLD_MS = 750;
const open = { relaying: true, quietSince: 0 };

test("speech keeps the relay open", () => {
  const state = nextSpeechGateState({ contextRunning: true, level: LOUD, now: 1_000 }, open);
  assert.equal(state.relaying, true);
  assert.equal(state.quietSince, 0);
});

test("a short pause for breath does not cut the relay", () => {
  let state = nextSpeechGateState({ contextRunning: true, level: QUIET, now: 1_000 }, open);
  assert.equal(state.relaying, true, "quiet starts the clock, it does not close the gate");
  state = nextSpeechGateState({ contextRunning: true, level: QUIET, now: 1_000 + HOLD_MS - 1 }, state);
  assert.equal(state.relaying, true, "still within the hold");
});

test("sustained silence closes the relay so nothing is invented from it", () => {
  let state = nextSpeechGateState({ contextRunning: true, level: QUIET, now: 1_000 }, open);
  state = nextSpeechGateState({ contextRunning: true, level: QUIET, now: 1_000 + HOLD_MS }, state);
  assert.equal(state.relaying, false);
});

test("the very next sound reopens it, with no hold on the way back", () => {
  let state = { relaying: false, quietSince: 500 };
  state = nextSpeechGateState({ contextRunning: true, level: LOUD, now: 9_000 }, state);
  assert.equal(state.relaying, true, "a speaker must never be cut off mid-word waiting for a gate");
  assert.equal(state.quietSince, 0);
});

test("a softly spoken word still holds the gate open", () => {
  // Clipping quiet speech would feed the model half a sentence and mistranslate
  // it, which is worse than relaying a moment of silence. Just above the
  // threshold must count as speech.
  const SOFT = 0.004;
  let state = { relaying: false, quietSince: 400 };
  state = nextSpeechGateState({ contextRunning: true, level: SOFT, now: 5_000 }, state);
  assert.equal(state.relaying, true);
  assert.equal(state.quietSince, 0);
});

test("a suspended audio context preserves the last known gate state", () => {
  let state = { relaying: false, quietSince: 0 };
  for (let tick = 0; tick < 200; tick += 1) {
    state = nextSpeechGateState({ contextRunning: false, level: 0, now: tick * 100 }, state);
    assert.equal(state.relaying, false, `must stay closed at tick ${tick}`);
  }
});

test("a gate already shut stays shut until measurable speech arrives", () => {
  let state = { relaying: false, quietSince: 1_000 };
  state = nextSpeechGateState({ contextRunning: false, level: 0, now: 5_000 }, state);
  assert.equal(state.relaying, false);
  state = nextSpeechGateState({ contextRunning: true, level: LOUD, now: 5_050 }, state);
  assert.equal(state.relaying, true);
});

test("the quiet clock starts once and is not pushed forward by further quiet", () => {
  let state = nextSpeechGateState({ contextRunning: true, level: QUIET, now: 1_000 }, open);
  const started = state.quietSince;
  state = nextSpeechGateState({ contextRunning: true, level: QUIET, now: 1_600 }, state);
  assert.equal(state.quietSince, started, "otherwise the gate would never reach its hold");
});
