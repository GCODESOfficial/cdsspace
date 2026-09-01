import "server-only";

import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { dedupeCandidates, type CompanyCandidate } from "@/lib/prospect-generation";
import { normalizeCountry, sizeBandFor } from "@/lib/prospect-directory";
import { registryFor } from "@/lib/prospect-registries";

/**
 * Writing companies into the directory. Shared by the admin route and the
 * terminal populate script so both apply exactly the same identity, merge, and
 * country-presence rules.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Rows a single registry run will take on before handing back a cursor.
export const REGISTRY_ROW_BUDGET = 20_000;

/**
 * Inserts candidates that are genuinely new and folds the rest into the company
 * they duplicate. A company already in the directory that arrives again from a
 * different country list gains a country row and an alias, never a second row.
 */
export async function mergeCandidates(
  entries: Array<{ candidate: CompanyCandidate; countries: string[] }>,
  batchId: string,
  actor: string,
) {
  if (!entries.length) return { created: 0, merged: 0, countriesAdded: 0 };

  const domains = entries.map((entry) => entry.candidate.domain).filter(Boolean) as string[];
  const nameKeys = entries.map((entry) => entry.candidate.name_key);

  const [byDomain, byName, byAlias] = await Promise.all([
    domains.length ? glashQuery<any>(`select id, domain, name_key, registration_id, registry_source from public.prospect_companies where domain = any($1::text[])`, [domains]) : [],
    glashQuery<any>(`select id, domain, name_key, registration_id, registry_source from public.prospect_companies where name_key = any($1::text[])`, [nameKeys]),
    glashQuery<any>(`select company_id id, name_key from public.prospect_company_aliases where name_key = any($1::text[])`, [nameKeys]),
  ]);

  const domainIndex = new Map<string, string>(byDomain.map((row) => [row.domain, row.id]));
  const nameIndex = new Map<string, string>([
    ...byAlias.map((row) => [row.name_key, row.id] as [string, string]),
    ...byName.map((row) => [row.name_key, row.id] as [string, string]),
  ]);
  const nameRows = new Map<string, any>(byName.map((row) => [row.name_key, row]));

  const fresh: Array<{ candidate: CompanyCandidate; countries: string[] }> = [];
  const existing: Array<{ id: string; entry: { candidate: CompanyCandidate; countries: string[] } }> = [];

  for (const entry of entries) {
    const domainMatch = entry.candidate.domain ? domainIndex.get(entry.candidate.domain) : undefined;
    if (domainMatch) { existing.push({ id: domainMatch, entry }); continue; }

    const nameMatch = nameIndex.get(entry.candidate.name_key);
    if (!nameMatch) { fresh.push(entry); continue; }

    // Two entries carrying different official registration numbers are different
    // companies however alike the names read, and that holds across registers as
    // much as within one: "Vistra Corp" on the SEC register and "Vistra OU" on
    // the Estonian register are unrelated businesses that share a word. Only a
    // shared domain is evidence strong enough to merge across registers.
    const held = nameRows.get(entry.candidate.name_key);
    const conflicting = Boolean(
      held && entry.candidate.registration_id && held.registration_id
      && held.registration_id !== entry.candidate.registration_id,
    );
    if (conflicting) {
      fresh.push({ ...entry, candidate: { ...entry.candidate, name_key: `${entry.candidate.name_key}#${entry.candidate.registration_id}` } });
      continue;
    }
    existing.push({ id: nameMatch, entry });
  }

  // New companies.
  const createdIds: Array<{ id: string; entry: { candidate: CompanyCandidate; countries: string[] } }> = [];
  // 25 parameters per row against Postgres's 65,535 parameter ceiling, so 1,000
  // rows per statement is the largest safe chunk and roughly five times fewer
  // round trips than a small one over a register of millions.
  for (let index = 0; index < fresh.length; index += 1000) {
    const chunk = fresh.slice(index, index + 1000);
    const params: unknown[] = [];
    const values = chunk.map((entry) => {
      const base = params.length;
      const candidate = entry.candidate;
      // An official register answers "is it still trading" outright, so a
      // dissolved company is recorded as such and never enters the crawl queue.
      const dead = ["dissolved", "closed", "liquidation", "removed", "inactive"].includes(String(candidate.registry_status || "").toLowerCase());
      params.push(
        batchId, candidate.company_name, candidate.name_key, candidate.domain, candidate.website,
        candidate.country, candidate.city ?? null, candidate.industry, candidate.registration_id,
        candidate.employee_count ?? null, sizeBandFor(candidate.employee_count ?? null), candidate.founded_year ?? null,
        candidate.registry_status ?? null, candidate.registry_source ?? null,
        candidate.is_public ?? null, candidate.is_startup ?? null, candidate.ticker ?? null,
        JSON.stringify(candidate.exchange ? [candidate.exchange] : []),
        JSON.stringify(candidate.email ? [{ email: candidate.email, source_url: candidate.source_url || "", kind: "registry" }] : []),
        JSON.stringify(candidate.phone ? [candidate.phone] : []),
        dead ? "inactive" : "unknown",
        dead ? "The official register records this company as no longer active." : null,
        dead ? "skipped" : "queued",
        candidate.note, candidate.source_url, actor,
      );
      // Positions 17 to 19 are the jsonb columns and are cast explicitly.
      const jsonbPositions = new Set([18, 19, 20]);
      return `(${Array.from({ length: 26 }, (_, index) => `$${base + index + 1}${jsonbPositions.has(index + 1) ? "::jsonb" : ""}`).join(",")})`;
    }).join(",");
    const rows = await glashQuery<any>(
      `insert into public.prospect_companies
         (batch_id,company_name,name_key,domain,website,country,city,industry,registration_id,
          employee_count,size_band,founded_year,registry_status,registry_source,is_public,is_startup,ticker,
          stock_exchanges,emails,phones,activity_status,activity_evidence,enrichment_status,
          notes,source_url,created_by)
       values ${values}
       on conflict do nothing
       returning id, name_key, domain`,
      params,
    );
    for (const row of rows) {
      const entry = chunk.find((item) => item.candidate.name_key === row.name_key && (item.candidate.domain || null) === (row.domain || null));
      if (entry) createdIds.push({ id: row.id, entry });
    }
  }

  // Country presence for both new and already-known companies.
  const presence: Array<[string, string, string | null, boolean, string | null]> = [];
  for (const { id, entry } of [...createdIds, ...existing]) {
    const countries = entry.countries.length ? entry.countries : entry.candidate.country ? [entry.candidate.country] : [];
    const isNew = createdIds.some((created) => created.id === id);
    for (const country of countries) {
      const normalized = normalizeCountry(country);
      if (normalized) presence.push([id, normalized, entry.candidate.registration_id, isNew, entry.candidate.source_url]);
    }
  }
  let countriesAdded = 0;
  for (let index = 0; index < presence.length; index += 2000) {
    const chunk = presence.slice(index, index + 2000);
    const params: unknown[] = [];
    const values = chunk.map((row) => {
      const base = params.length;
      params.push(...row);
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`;
    }).join(",");
    const rows = await glashQuery<any>(
      `insert into public.prospect_company_countries (company_id,country,registration_id,is_headquarters,source_url)
       values ${values} on conflict do nothing returning id`,
      params,
    );
    countriesAdded += rows.length;
  }

  // Record the spelling this list used so the next import matches on it too.
  const aliases = existing
    .filter(({ entry }) => entry.candidate.name_key)
    .map(({ id, entry }) => [id, entry.candidate.company_name, entry.candidate.name_key, entry.candidate.source_url] as const);
  for (let index = 0; index < aliases.length; index += 2000) {
    const chunk = aliases.slice(index, index + 2000);
    const params: unknown[] = [];
    const values = chunk.map((row) => {
      const base = params.length;
      params.push(...row);
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4})`;
    }).join(",");
    await glashQuery(
      `insert into public.prospect_company_aliases (company_id,alias,name_key,source_url) values ${values} on conflict do nothing`,
      params,
    );
  }

  return { created: createdIds.length, merged: entries.length - createdIds.length, countriesAdded };
}


export interface RegistryRunResult {
  batchId: string;
  created: number;
  merged: number;
  countriesAdded: number;
  done: boolean;
  notes: string[];
}

/**
 * Advances one register by up to `slices` slices, stopping early once the row
 * budget is reached. The batch stores the cursor, so the next call resumes.
 */
export async function runRegistryImport(input: {
  registryKey: string;
  actor: string;
  slices?: number;
  rowBudget?: number;
}): Promise<RegistryRunResult> {
  const registry = registryFor(input.registryKey);
  if (!registry) throw new Error("Unknown register.");
  const slices = Math.max(1, Math.min(50, input.slices || 3));
  const rowBudget = input.rowBudget || REGISTRY_ROW_BUDGET;

  // One batch per register, so a run always resumes where the last one stopped.
  let batch = await glashMaybeOne<any>(
    `select * from public.prospect_import_batches where registry_key=$1 order by created_at desc limit 1`,
    [input.registryKey],
  );
  if (!batch) {
    batch = await glashMaybeOne<any>(
      `insert into public.prospect_import_batches (label,source_kind,registry_key,status,created_by)
       values ($1,'registry',$2,'parsed',$3) returning *`,
      [registry.label, input.registryKey, input.actor],
    );
  }
  if (batch.exhausted) {
    return { batchId: batch.id, created: 0, merged: 0, countriesAdded: 0, done: true, notes: ["This register has been read to the end."] };
  }

  let cursor = batch.cursor || null;
  let created = 0;
  let merged = 0;
  let countriesAdded = 0;
  let done = false;
  let harvested = 0;
  const notes: string[] = [];

  for (let slice = 0; slice < slices; slice += 1) {
    const page = await registry.fetchPage(cursor);
    notes.push(page.note);
    harvested += page.candidates.length;
    if (page.candidates.length) {
      const result = await mergeCandidates(dedupeCandidates(page.candidates), batch.id, input.actor);
      created += result.created;
      merged += result.merged;
      countriesAdded += result.countriesAdded;
    }
    cursor = page.cursor;
    if (page.done || !cursor) { done = true; break; }
    if (harvested >= rowBudget) break;
  }

  await glashQuery(
    `update public.prospect_import_batches
     set cursor=$2::jsonb, exhausted=$3, last_run_at=now(),
         discovered_count = discovered_count + $4 + $5,
         created_count = created_count + $4,
         duplicate_count = duplicate_count + $5,
         updated_at=now()
     where id=$1`,
    [batch.id, cursor ? JSON.stringify(cursor) : null, done, created, merged],
  );

  return { batchId: batch.id, created, merged, countriesAdded, done, notes };
}
