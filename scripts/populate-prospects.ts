/**
 * Populates the prospect directory from official company registers.
 *
 * Registry imports are long running, so they belong in a terminal rather than a
 * browser tab. This walks each register slice by slice, storing its cursor after
 * every run, and can be stopped and restarted at any point without losing place.
 *
 * Environment comes from .env, loaded by `node -r dotenv/config` in the npm
 * script, so the database pool sees it before it is created.
 *
 *   npm run populate-prospects -- --list
 *   npm run populate-prospects -- --registry estonia_ariregister --minutes 10
 *   npm run populate-prospects -- --all --minutes 30
 */

import { runRegistryImport } from "@/lib/prospect-import";
import { REGISTRIES, registryCatalogue, registryFor } from "@/lib/prospect-registries";
import { glashQuery } from "@/lib/glashdb/postgres";

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function directoryTotal() {
  const [row] = await glashQuery<any>(`select value from public.prospect_directory_counters where bucket='total'`);
  return Number(row?.value || 0);
}

async function walk(key: string, deadline: number, actor: string) {
  const registry = registryFor(key);
  if (!registry) throw new Error(`Unknown register ${key}`);
  let created = 0;
  let merged = 0;
  let runs = 0;

  for (;;) {
    if (Date.now() > deadline) {
      console.log(`  time budget reached, stopping. Run again to continue.`);
      break;
    }
    const started = Date.now();
    const result = await runRegistryImport({ registryKey: key, actor, slices: 3 });
    runs += 1;
    created += result.created;
    merged += result.merged;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`  run ${runs}: +${result.created.toLocaleString()} new, ${result.merged.toLocaleString()} merged, ${seconds}s. ${result.notes.slice(-1)[0] || ""}`);
    if (result.done) {
      console.log(`  ${registry.label} has been read to the end.`);
      break;
    }
    if (!result.created && !result.merged) {
      console.log(`  no rows returned, stopping to avoid spinning.`);
      break;
    }
  }
  return { created, merged, runs };
}

async function main() {
  if (flag("list")) {
    for (const entry of registryCatalogue()) {
      const state = entry.needsBrowser ? "browser only" : entry.ready ? "ready" : `needs ${entry.keyEnv}`;
      console.log(`${entry.key.padEnd(24)} ${String(entry.country).padEnd(18)} ${state}`);
    }
    return;
  }

  const actor = argument("actor") || "populate-script";
  const minutes = Number(argument("minutes") || 10);
  const deadline = Date.now() + Math.max(1, minutes) * 60_000;

  const requested = argument("registry");
  const keys = requested
    ? [requested]
    : flag("all")
      ? REGISTRIES.filter((entry) => !entry.needsBrowser && (!entry.keyEnv || (process.env[entry.keyEnv] || "").trim())).map((entry) => entry.key)
      : [];

  if (!keys.length) {
    console.log("Choose --registry <key>, or --all. Use --list to see the registers.");
    process.exitCode = 1;
    return;
  }

  const before = await directoryTotal();
  console.log(`Directory holds ${before.toLocaleString()} companies. Budget ${minutes} minutes.\n`);

  let created = 0;
  let merged = 0;
  for (const key of keys) {
    if (Date.now() > deadline) break;
    console.log(`${registryFor(key)?.label || key}`);
    try {
      const result = await walk(key, deadline, actor);
      created += result.created;
      merged += result.merged;
    } catch (error) {
      console.log(`  stopped: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log("");
  }

  const after = await directoryTotal();
  console.log(`Added ${created.toLocaleString()} companies, merged ${merged.toLocaleString()} duplicates.`);
  console.log(`Directory now holds ${after.toLocaleString()} companies.`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
