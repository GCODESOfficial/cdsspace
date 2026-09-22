import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import "dotenv/config";

const DIR = "glashdb/migrations";
const PENDING = new Set(process.argv.slice(2));
const all = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const connectionString =
  process.env.GLASHDB_DIRECT_URL ||
  process.env.DIRECT_URL ||
  process.env.GLASHDB_DATABASE_URL ||
  process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("No database connection URL is configured.");
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

await client.query(`
  create table if not exists public.schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now(),
    baseline boolean not null default false
  )`);

const { rows: existing } = await client.query(
  "select filename from public.schema_migrations",
);
const known = new Set(existing.map((r) => r.filename));

// Baselining is a one-time act for the migrations that predate this runner. Once
// the table has entries, an unrecorded file is a migration nobody has run yet -
// marking it applied would skip it silently and leave the schema behind.
const firstRun = existing.length === 0;
const baseline = firstRun ? all.filter((f) => !PENDING.has(f) && !known.has(f)) : [];
const unrecorded = firstRun ? [] : all.filter((f) => !PENDING.has(f) && !known.has(f));
if (unrecorded.length) {
  console.log(`${unrecorded.length} migration(s) are neither recorded nor requested. Pass them by name to apply:`);
  for (const f of unrecorded) console.log("  " + f);
}
if (baseline.length) {
  await client.query(
    "insert into public.schema_migrations (filename, baseline) select unnest($1::text[]), true on conflict do nothing",
    [baseline],
  );
  console.log(`baselined ${baseline.length} previously applied migrations`);
}

for (const filename of all.filter((f) => PENDING.has(f))) {
  if (known.has(filename)) {
    console.log(`SKIP    ${filename} (already recorded)`);
    continue;
  }
  const sql = readFileSync(path.join(DIR, filename), "utf8");
  const ownsTransaction = /^begin;/im.test(sql);
  try {
    if (!ownsTransaction) await client.query("begin");
    await client.query(sql);
    if (!ownsTransaction) await client.query("commit");
    await client.query(
      "insert into public.schema_migrations (filename) values ($1) on conflict do nothing",
      [filename],
    );
    console.log(`APPLIED ${filename}`);
  } catch (error) {
    if (!ownsTransaction) await client.query("rollback").catch(() => {});
    console.error(`FAILED  ${filename}\n  ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

const { rows: count } = await client.query(
  "select count(*)::int as n from public.schema_migrations",
);
console.log(`schema_migrations now tracks ${count[0].n} files`);
await client.end();
