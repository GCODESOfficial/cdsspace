/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api-auth";
import { glashMaybeOne, glashQuery } from "@/lib/glashdb/postgres";
import { assertTrustedMutationOrigin } from "@/lib/intelligence/security";
import { checkIntelligenceRateLimit } from "@/lib/intelligence/rate-limit";
import { dedupeCandidates, harvestFromUrl, parseCompanyInput, type CompanyCandidate } from "@/lib/prospect-generation";
import { mergeCandidates, runRegistryImport } from "@/lib/prospect-import";
import { runEnrichmentPass } from "@/lib/prospect-research-pass";
import { activeResearchRun, advanceResearchRun, startResearchRun, stopResearchRun } from "@/lib/prospect-research-runner";
import { DIRECTORY_TARGET, SIZE_BANDS, companyNameKey, normalizeCountry, sizeBandFor } from "@/lib/prospect-directory";
import { PROSPECT_ISSUES, isProspectIssue } from "@/lib/prospect-issues";
import { registryCatalogue, registryFor } from "@/lib/prospect-registries";
import { browserConfigured, browserSetupHint } from "@/lib/prospect-browser";
import { logActivity } from "@/lib/activity-log";
import { recordProspectEvent } from "@/lib/deal-pipeline";
import { huntCompanyEmails } from "@/lib/prospect-email-hunt";
import { auditForAiSearch } from "@/lib/prospect-ai-audit";
import { chatComplete } from "@/lib/ai/openai";
import { CATEGORIES } from "@/lib/constants";
import { sendEmail } from "@/lib/email-from";
import { brandedEmailHtml } from "@/lib/email-template";
import { sanitizeCompanyCompetitors } from "@/lib/prospect-competitors";
import { normalizeBrandFindings } from "@/lib/prospect-brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PERMISSION = "deals.prospects";

const SERVICE_NAMES = CATEGORIES.map((category) => category.name);

function companyForOutput<T extends Record<string, unknown>>(company: T): T {
  const competitors = sanitizeCompanyCompetitors(company);
  const brandConsistency = normalizeBrandFindings(competitors.brand_consistency);
  const issues = Array.isArray(competitors.issues)
    ? competitors.issues.filter((issue) => issue !== "inconsistent_communications" || brandConsistency.some((finding) => finding.status === "differs"))
    : [];
  return {
    ...competitors,
    brand_consistency: brandConsistency,
    issues,
  };
}

// Enrichment is a live crawl, so a request handles a small slice and the page
// keeps calling back until the queue drains. That keeps a directory of millions
// moving without any single request exceeding the execution ceiling.
const MAX_BATCH = 8;
const DEFAULT_BATCH = 4;

// Above this many matching rows the list view reports an estimate. Counting ten
// million rows exactly on every keystroke is not worth the table scan.
const EXACT_COUNT_LIMIT = 50_000;

/**
 * The columns a collapsed list row actually renders. The research columns left
 * out here - competitors, brand consistency, pain points, the drafted outreach
 * email, the crawl findings - are the bulk of a company record: selecting all
 * 60 columns made a page of 100 companies a 694 KB response, of which roughly
 * seven tenths was never on screen. They are fetched per company by
 * `resource=company` when a row is expanded or an action needs them.
 */
const LIST_COLUMNS = [
  "id", "company_name", "domain", "website", "industry", "city", "country", "hq_country",
  "country_count", "employee_count", "employee_range", "size_band", "founded_year",
  "is_public", "stock_exchanges", "ticker", "is_startup",
  "activity_status", "website_status", "website_score", "issues",
  // Needed even though the collapsed row never prints it: companyForOutput()
  // decides whether the "inconsistent communications" chip is honest by asking
  // whether any brand finding actually differs. Without it every row would
  // quietly lose that issue.
  "brand_consistency",
  "deal_score", "priority", "enrichment_status", "enrichment_error",
  "review_status", "prospect_id", "batch_id", "name_key", "created_at", "updated_at",
].join(", ");


function str(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Escapes text destined for the outreach email body. */
function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function uuid(value: unknown) {
  const candidate = str(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : "";
}

function intValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function boolValue(value: unknown) {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return null;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// A company found under a different spelling in another country's register is
// still the company being searched for. At most this many are folded in, which
// is far more than a person reads in one page of results.
const ALIAS_MATCH_LIMIT = 500;

/** Ids of companies whose alternate names match every word typed. */
async function aliasMatches(tokens: string[]): Promise<string[]> {
  if (!tokens.length) return [];
  const values: string[] = [];
  const clauses = tokens.map((token) => {
    const key = companyNameKey(token) || token.toLowerCase();
    const contains = token.length >= 3;
    values.push(contains ? `%${token}%` : `${token}%`);
    const aliasIndex = values.length;
    values.push(contains ? `%${key}%` : `${key}%`);
    return `(alias ilike $${aliasIndex} or name_key ilike $${values.length})`;
  });
  const rows = await glashQuery<any>(
    `select distinct company_id from public.prospect_company_aliases
      where ${clauses.join(" and ")} limit ${ALIAS_MATCH_LIMIT}`,
    values,
  );
  return rows.map((row) => row.company_id);
}

/** Builds the shared where clause for every filtered company query. */
async function companyFilters(params: URLSearchParams) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (clause: (index: number) => string, value: unknown) => {
    values.push(value);
    conditions.push(clause(values.length));
  };

  const status = str(params.get("status"), 20);
  const review = str(params.get("review"), 20);
  const priority = str(params.get("priority"), 20);
  const websiteStatus = str(params.get("website_status"), 60);
  const activity = str(params.get("activity"), 20);
  const country = str(params.get("country"), 60);
  const industry = str(params.get("industry"), 60);
  const sizeBand = str(params.get("size_band"), 20);
  const letter = str(params.get("letter"), 1);
  const query = str(params.get("q"), 120);
  const batchId = uuid(params.get("batch_id"));
  const isPublic = boolValue(params.get("is_public"));
  const isStartup = boolValue(params.get("is_startup"));
  const multiCountry = boolValue(params.get("multi_country"));
  const hasWebsite = boolValue(params.get("has_website"));
  const hideInactive = boolValue(params.get("hide_inactive"));

  if (status) add((index) => `enrichment_status = $${index}`, status);
  if (review) add((index) => `review_status = $${index}`, review);
  if (priority) add((index) => `priority = $${index}`, priority);
  // Accepts one state or a comma separated set, so the "Website needs work"
  // card can filter to precisely the states it counts.
  if (websiteStatus) {
    const states = websiteStatus.split(",").map((value) => value.trim()).filter(Boolean);
    if (states.length > 1) add((index) => `website_status = any($${index}::text[])`, states);
    else add((index) => `website_status = $${index}`, states[0]);
  }
  if (activity) add((index) => `activity_status = $${index}`, activity);
  if (industry) add((index) => `industry ilike $${index}`, `%${industry}%`);
  if (SIZE_BANDS.some((band) => band.value === sizeBand)) add((index) => `size_band = $${index}`, sizeBand);
  if (batchId) add((index) => `batch_id = $${index}`, batchId);
  // A company is only ever marked public or startup on positive evidence, so
  // "not listed" has to mean "not proven listed" rather than "proven private".
  if (isPublic === true) conditions.push("is_public is true");
  if (isPublic === false) conditions.push("is_public is not true");
  if (isStartup === true) conditions.push("is_startup is true");
  if (isStartup === false) conditions.push("is_startup is not true");
  if (multiCountry === true) conditions.push("country_count > 1");
  // A company the register already calls dead is never worth showing by default.
  if (hideInactive === true) conditions.push("activity_status <> 'inactive'");
  if (hasWebsite === true) conditions.push("website is not null");
  if (hasWebsite === false) conditions.push("website is null");
  if (/^[a-z]$/i.test(letter)) add((index) => `name_key like $${index}`, `${letter.toLowerCase()}%`);

  // Issue filters. Several selected means "has all of these", which is how a
  // person reads two switches held down together.
  const issues = (params.get("issues") || params.get("issue") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(isProspectIssue);
  const uniqueIssues = Array.from(new Set(issues));
  const storedIssues = uniqueIssues.filter((issue) => issue !== "inconsistent_communications");
  if (storedIssues.length) add((index) => `issues @> $${index}::text[]`, storedIssues);
  if (uniqueIssues.includes("inconsistent_communications")) {
    // Older rows inferred inconsistency from different file bytes or dimensions.
    // Filter only on a remaining evidence-backed difference, matching the card.
    conditions.push(`exists (
      select 1 from jsonb_array_elements(coalesce(brand_consistency, '[]'::jsonb)) as brand_finding
      where brand_finding->>'status' = 'differs'
        and coalesce(brand_finding->>'detail', '') !~* 'different image file from the closest brand image|does not match any brand image.*different shape|does not visibly carry the company name'
    )`);
  }

  // A decision maker we can actually write to, which is what the summary card
  // above the list counts.
  if (boolValue(params.get("reachable_decision_maker")) === true) {
    conditions.push(`exists (
      select 1 from public.prospect_company_contacts pcc
       where pcc.company_id = prospect_companies.id
         and pcc.seniority = 'decision_maker' and pcc.email is not null
    )`);
  }

  // Search matches every word typed, in any order, anywhere inside the name,
  // the normalised name, the alternate names, the domain or the industry. So
  // "vistra" finds "Vistra Corp" and "Vistra Energy", and "lagos bank" finds a
  // bank in Lagos however the two words are arranged in its registered name.
  let rank = "";
  if (query) {
    const tokens = query.split(/\s+/).filter(Boolean).slice(0, 5);
    const tokenClauses: string[] = [];
    for (const token of tokens) {
      const key = companyNameKey(token) || token.toLowerCase();
      // Two characters are too few for a trigram lookup, so a short word is
      // matched as the start of a name rather than as a scan for it anywhere.
      const contains = token.length >= 3;
      values.push(contains ? `%${token}%` : `${token}%`);
      const nameIndex = values.length;
      values.push(contains ? `%${key}%` : `${key}%`);
      const keyIndex = values.length;
      tokenClauses.push(`(
        company_name ilike $${nameIndex}
        or name_key ilike $${keyIndex}
        or domain ilike $${nameIndex}
        or industry ilike $${nameIndex}
      )`);
    }

    // Alternate names are matched by id rather than by an `exists` subquery on
    // the alias table. The subquery reads cheaply on its own, but sitting
    // inside the same OR it stops the planner using the trigram indexes on the
    // company columns, which turned a 10ms search into a 1.9s scan of every
    // row. Resolving the ids first keeps both halves on an index.
    const aliasIds = await aliasMatches(tokens);
    let searchClause = tokenClauses.join(" and ");
    if (aliasIds.length) {
      values.push(aliasIds);
      searchClause = `(${searchClause} or id = any($${values.length}::uuid[]))`;
    }
    conditions.push(searchClause);

    // The whole phrase, for ordering only: an exact name first, then a name
    // starting with what was typed, then everything else that matched.
    // Written inline rather than as a parameter because the ordering is shared
    // with the count query, which binds the same value list and would reject a
    // parameter it does not itself reference. companyNameKey() leaves only
    // letters, digits and spaces, so there is nothing here to escape.
    const whole = companyNameKey(query);
    if (whole) rank = `case when name_key = '${whole}' then 0 when name_key like '${whole}%' then 1 else 2 end`;
  }

  const foundedFrom = Number(params.get("founded_from"));
  const foundedTo = Number(params.get("founded_to"));
  if (Number.isFinite(foundedFrom) && foundedFrom > 1500) add((index) => `founded_year >= $${index}`, Math.round(foundedFrom));
  if (Number.isFinite(foundedTo) && foundedTo > 1500) add((index) => `founded_year <= $${index}`, Math.round(foundedTo));

  // Deal score band. The two ends are independent, so "below 50" is a top end
  // alone, "50 and above" a bottom end alone, and clicking a company's score
  // badge sends the same number as both ends to gather everyone who scored it.
  const scoreFrom = Number(params.get("score_from"));
  const scoreTo = Number(params.get("score_to"));
  if (Number.isFinite(scoreFrom) && params.get("score_from")) add((index) => `deal_score >= $${index}`, Math.min(100, Math.max(0, Math.round(scoreFrom))));
  if (Number.isFinite(scoreTo) && params.get("score_to")) add((index) => `deal_score <= $${index}`, Math.min(100, Math.max(0, Math.round(scoreTo))));

  const staffFrom = Number(params.get("staff_from"));
  const staffTo = Number(params.get("staff_to"));
  if (Number.isFinite(staffFrom) && staffFrom > 0) add((index) => `employee_count >= $${index}`, Math.round(staffFrom));
  if (Number.isFinite(staffTo) && staffTo > 0) add((index) => `employee_count <= $${index}`, Math.round(staffTo));

  const exchange = str(params.get("exchange"), 20);
  if (exchange) add((index) => `stock_exchanges @> $${index}::jsonb`, JSON.stringify([exchange.toUpperCase()]));

  // Country is a presence row, not a column, so a company trading in six
  // countries is found by any of the six without being stored six times.
  if (country) {
    values.push(country.toLowerCase());
    conditions.push(`exists (select 1 from public.prospect_company_countries pcc where pcc.company_id = prospect_companies.id and lower(pcc.country) = $${values.length})`);
  }

  return { where: conditions.length ? `where ${conditions.join(" and ")}` : "", values, rank };
}

const SORTS: Record<string, string> = {
  score: "deal_score desc, updated_at desc",
  // Reading the directory from the weakest prospect upward is how you find
  // the ones worth fixing or dropping, so it is offered beside the default.
  score_asc: "deal_score asc, updated_at desc",
  name_asc: "name_key asc",
  name_desc: "name_key desc",
  founded_new: "founded_year desc nulls last",
  founded_old: "founded_year asc nulls last",
  staff_desc: "employee_count desc nulls last",
  staff_asc: "employee_count asc nulls last",
  countries: "country_count desc, deal_score desc",
  newest: "created_at desc",
};

/**
 * Only for a result set past the exact-count ceiling, where counting for real
 * would mean scanning the directory. The caller has already counted up to the
 * ceiling in the same round trip as the page itself.
 */
async function estimateCompanies(where: string, values: unknown[], sampled: number) {
  const plan = await glashQuery<any>(`explain (format json) select 1 from public.prospect_companies ${where}`, values);
  const rows = plan?.[0]?.["QUERY PLAN"]?.[0]?.Plan?.["Plan Rows"];
  return { total: Math.max(sampled, Math.round(Number(rows) || sampled)), estimated: true };
}

export async function GET(req: NextRequest) {
  const { denied } = await requireAdmin(req, PERMISSION);
  if (denied) return denied;
  const params = req.nextUrl.searchParams;
  const resource = str(params.get("resource"), 40) || "summary";

  try {
    if (resource === "summary") {
      // All overview figures are trigger-maintained. This is intentionally one
      // small database round trip: full-table country and industry aggregates
      // took close to twenty seconds once the directory reached 1.6m records
      // and could outlive the hosting proxy request.
      const [summary] = await glashQuery<any>(`select
        (select coalesce(json_object_agg(bucket, value), '{}'::json)
           from public.prospect_directory_counters) counters,
        (select coalesce(json_agg(to_jsonb(batch_row) order by batch_row.created_at desc), '[]'::json)
           from (select * from public.prospect_import_batches order by created_at desc limit 30) batch_row) batches,
        (select coalesce(json_agg(json_build_object('country', country_row.label, 'companies', country_row.company_count)
                                  order by country_row.company_count desc, country_row.label), '[]'::json)
           from (select label, company_count from public.prospect_directory_facets
                  where facet = 'country' order by company_count desc, label limit 25) country_row) top_countries,
        (select coalesce(json_agg(industry_row.label order by industry_row.company_count desc, industry_row.label), '[]'::json)
           from (select label, company_count from public.prospect_directory_facets
                  where facet = 'industry' order by company_count desc, label limit 40) industry_row) industries,
        (select count(*)::int from public.prospect_directory_facets
          where facet = 'country' and company_count > 0) countries_covered`);
      const counters = summary?.counters || {};
      const value = (bucket: string) => Number(counters[bucket] || 0);
      return NextResponse.json({
        totals: {
          total: value("total"),
          queued: value("enrichment:queued"),
          running: value("enrichment:running"),
          enriched: value("enrichment:enriched"),
          failed: value("enrichment:failed"),
          active_companies: value("activity:active"),
          needs_website: value("website:outdated") + value("website:missing") + value("website:broken"),
          high_priority: value("priority:high"),
          promoted: value("review:promoted"),
          multi_country: value("multi_country"),
          countries_covered: Number(summary?.countries_covered || 0),
          reachable_decision_makers: value("reachable_decision_makers"),
        },
        batches: summary?.batches || [],
        topCountries: summary?.top_countries || [],
        industries: summary?.industries || [],
        target: DIRECTORY_TARGET,
      });
    }

    if (resource === "registries") {
      const runs = await glashQuery<any>(
        `select registry_key, id, label, cursor, exhausted, created_count, last_run_at
         from public.prospect_import_batches where registry_key is not null
         order by last_run_at desc nulls last limit 50`,
      );
      return NextResponse.json({
        registries: registryCatalogue(),
        runs,
        browser: { connected: browserConfigured(), hint: browserSetupHint() },
      });
    }

    if (resource === "companies") {
      const { where, values, rank } = await companyFilters(params);
      const limit = intValue(params.get("limit"), 50, 1, 200);
      const offset = intValue(params.get("offset"), 0, 0, 5_000_000);
      // When a name has been typed, the closest name comes first whatever the
      // chosen sort; the sort then orders the companies of equal closeness.
      const sort = `${rank ? `${rank}, ` : ""}${SORTS[str(params.get("sort"), 20)] || SORTS.score}`;

      // The page, its contacts, its countries and the total all arrive in ONE
      // round trip. They used to be four queries in two waves, and against a
      // remote database the round trip is the whole cost: each of these answers
      // in well under a millisecond, while every wave paid the full network
      // latency again. That is what made a filter click feel slow.
      const [bundle] = await glashQuery<any>(
        `with page as (
           select ${LIST_COLUMNS} from public.prospect_companies ${where} order by ${sort} limit ${limit} offset ${offset}
         ), matched as (
           select p.*, row_number() over () as list_position from page p
         )
         select
           (select coalesce(json_agg(to_jsonb(m) - 'list_position' order by m.list_position), '[]'::json)
              from matched m) companies,
           (select count(*)::bigint
              from (select 1 from public.prospect_companies ${where} limit ${EXACT_COUNT_LIMIT + 1}) sample) total,
           (select coalesce(json_agg(to_jsonb(c) order by c.seniority, c.full_name), '[]'::json)
              from public.prospect_company_contacts c
             where c.company_id in (select id from matched)) contacts,
           (select coalesce(json_agg(json_build_object('company_id', pc.company_id, 'country', pc.country)
                                     order by pc.is_headquarters desc, pc.country), '[]'::json)
              from public.prospect_company_countries pc
             where pc.company_id in (select id from matched)) countries`,
        values,
      );

      const rows: any[] = bundle?.companies || [];
      const contacts: any[] = bundle?.contacts || [];
      const countries: any[] = bundle?.countries || [];

      // Past the exact-count ceiling the true total is not worth a full scan,
      // so the planner's estimate stands in. That extra trip is rare, and never
      // happens on a filter narrow enough for anyone to read the results.
      const sampled = Number(bundle?.total || 0);
      const count = sampled <= EXACT_COUNT_LIMIT
        ? { total: sampled, estimated: false }
        : await estimateCompanies(where, values, sampled);

      return NextResponse.json({
        companies: rows.map((rawRow) => {
          const row = companyForOutput(rawRow);
          return {
            ...row,
            contacts: contacts.filter((contact) => contact.company_id === row.id),
            countries: countries.filter((entry) => entry.company_id === row.id).map((entry) => entry.country),
          };
        }),
        total: count.total,
        estimated: count.estimated,
      });
    }

    // One company in full, for a row the reader has opened. The research
    // columns live here rather than in every list row, which is what keeps a
    // page of a hundred companies small enough to arrive quickly.
    if (resource === "company") {
      const id = uuid(params.get("id"));
      if (!id) return NextResponse.json({ error: "A company is required." }, { status: 400 });
      const [bundle] = await glashQuery<any>(
        `select
           (select to_jsonb(c) from public.prospect_companies c where c.id = $1) company,
           (select coalesce(json_agg(to_jsonb(pc) order by pc.seniority, pc.full_name), '[]'::json)
              from public.prospect_company_contacts pc where pc.company_id = $1) contacts,
           (select coalesce(json_agg(pcc.country order by pcc.is_headquarters desc, pcc.country), '[]'::json)
              from public.prospect_company_countries pcc where pcc.company_id = $1) countries`,
        [id],
      );
      if (!bundle?.company) return NextResponse.json({ error: "That company is no longer in the directory." }, { status: 404 });
      return NextResponse.json({
        company: {
          ...companyForOutput(bundle.company),
          contacts: bundle.contacts || [],
          countries: bundle.countries || [],
        },
      });
    }

    if (resource === "export") {
      const { where, values } = await companyFilters(params);
      const limit = intValue(params.get("limit"), 50_000, 1, 200_000);
      const rows = await glashQuery<any>(`select * from public.prospect_companies ${where} order by deal_score desc limit ${limit}`, values);
      const ids = rows.map((row) => row.id);
      const [contacts, countries] = await Promise.all([
        ids.length ? glashQuery<any>(`select * from public.prospect_company_contacts where company_id = any($1::uuid[]) and seniority = 'decision_maker'`, [ids]) : [],
        ids.length ? glashQuery<any>(`select company_id, country from public.prospect_company_countries where company_id = any($1::uuid[])`, [ids]) : [],
      ]);
      const header = ["Company", "Domain", "Website", "HQ country", "Countries", "Country count", "Industry", "Staff", "Size band", "Founded", "Publicly traded", "Exchanges", "Ticker", "Startup", "Activity", "Website status", "Website score", "Deal score", "Priority", "Decision makers", "Decision maker emails", "General emails", "Socials", "Brief", "Pain points", "How we help", "Service fit", "Local competitors", "Global competitors", "Outreach subject", "Outreach email"];
      const lines = [header.join(",")];
      for (const rawRow of rows) {
        const row = companyForOutput(rawRow);
        const rowContacts = contacts.filter((contact) => contact.company_id === row.id);
        const rowCountries = countries.filter((entry) => entry.company_id === row.id).map((entry) => entry.country);
        lines.push([
          row.company_name, row.domain, row.website, row.hq_country, rowCountries.join("; "), row.country_count,
          row.industry, row.employee_count, row.size_band, row.founded_year,
          row.is_public === null ? "" : row.is_public ? "yes" : "no",
          (row.stock_exchanges || []).join("; "), row.ticker,
          row.is_startup === null ? "" : row.is_startup ? "yes" : "no",
          row.activity_status, row.website_status, row.website_score, row.deal_score, row.priority,
          rowContacts.map((contact: any) => `${contact.full_name} (${contact.job_title || "unknown"})`).join("; "),
          rowContacts.map((contact: any) => contact.email).filter(Boolean).join("; "),
          (row.emails || []).map((entry: any) => entry.email).join("; "),
          (row.socials || []).map((entry: any) => entry.url).join("; "),
          row.brief,
          (row.pain_points || []).join(" | "),
          (row.how_we_help || []).join(" | "),
          (row.service_fit || []).map((entry: any) => entry.service).join("; "),
          (row.competitors_local || []).map((entry: any) => `${entry.type}: ${entry.name}`).join("; "),
          (row.competitors_global || []).map((entry: any) => `${entry.type}: ${entry.name}`).join("; "),
          row.outreach_subject, row.outreach_email,
        ].map(csvCell).join(","));
      }
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="cdsspace-directory-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Prospect generation could not be loaded." }, { status: 500 });
  }
}

/**
 * Copies a researched company onto the prospect checklist and starts its
 * pipeline. Shared by the explicit "Add to checklist" action and by
 * shortlisting, which readers reasonably expect to put a company on the list
 * rather than only flag it in this view.
 */
async function promoteCompanyToChecklist(id: string, actor: string, reviewStatus: "promoted" | "shortlisted" = "promoted") {
    const storedCompany = await glashMaybeOne<any>(`select * from public.prospect_companies where id=$1`, [id]);
    if (!storedCompany) return { error: "Company not found.", status: 404 } as const;
    const company = companyForOutput(storedCompany);
    if (company.prospect_id) return { error: "This company is already on the prospect checklist.", status: 409 } as const;

    const [contacts, countries] = await Promise.all([
      glashQuery<any>(`select * from public.prospect_company_contacts where company_id=$1 order by seniority`, [id]),
      glashQuery<any>(`select country from public.prospect_company_countries where company_id=$1 order by is_headquarters desc`, [id]),
    ]);
    const lead = contacts.find((contact) => contact.seniority === "decision_maker" && contact.email) || contacts.find((contact) => contact.email) || contacts[0];

    // The whole write-up is copied onto the checklist entry so the team can
    // edit it and add their own findings, leaving the researched record intact.
    const section = (title: string, body: string) => body.trim() ? `${title}\n${body.trim()}` : "";
    const bullets = (items: unknown[], format: (entry: any) => string) =>
      (Array.isArray(items) ? items : []).map((entry) => `- ${format(entry)}`).join("\n");

    const researchBrief = [
      section("SUMMARY", company.brief || ""),
      section("TRADING STATUS", company.activity_evidence || ""),
      section("PROFILE", [
        company.industry ? `Industry: ${company.industry}` : "",
        company.employee_count ? `Staff: ${company.employee_count}` : "",
        company.founded_year ? `Founded: ${company.founded_year}` : "",
        company.is_public ? `Publicly traded${company.ticker ? ` (${(company.stock_exchanges || []).join(", ")}: ${company.ticker})` : ""}` : "",
        countries.length ? `Countries: ${countries.map((entry) => entry.country).join(", ")}` : "",
        company.website ? `Website: ${company.website}` : "No website found",
      ].filter(Boolean).join("\n")),
      section("PAIN POINTS", bullets(company.pain_points, (entry) => String(entry))),
      section("HOW CDS SPACE HELPS", bullets(company.how_we_help, (entry) => String(entry))),
      section("SERVICE FIT", bullets(company.service_fit, (entry) => `${entry.service}: ${entry.reason}`)),
      section("WEBSITE FINDINGS", bullets(company.website_findings, (entry) => String(entry))
        + (company.website_score !== null ? `\n(Website score ${company.website_score} out of 100)` : "")),
      section("BRAND CONSISTENCY", bullets(company.brand_consistency, (entry) => `${entry.area} [${entry.status}]: ${entry.detail}`)),
      section("DOMAIN CONFIGURATION", bullets(company.domain_variants, (entry) => `${entry.host}: ${entry.note}`)),
      section("CONTACT ROUTES", [
        bullets(contacts, (entry) => `${entry.full_name}${entry.job_title ? `, ${entry.job_title}` : ""} (${entry.seniority.replace("_", " ")})${entry.email ? ` - ${entry.email}` : " - no public email"}`),
        bullets(company.emails, (entry) => `${entry.email} (${entry.kind})`),
        bullets(company.dns_contacts, (entry) => `${entry.value}: ${entry.detail}`),
        bullets(company.socials, (entry) => `${entry.platform}: ${entry.url}`),
      ].filter(Boolean).join("\n")),
      section("LOCAL COMPETITORS", bullets(company.competitors_local, (entry) => `${entry.type === "indirect" ? "Indirect" : "Direct"}: ${entry.name}${entry.note ? `: ${entry.note}` : ""}`)),
      section("GLOBAL COMPETITORS", bullets(company.competitors_global, (entry) => `${entry.type === "indirect" ? "Indirect" : "Direct"}: ${entry.name}${entry.note ? `: ${entry.note}` : ""}`)),
      section("OUTREACH ANGLE", company.outreach_angle || ""),
      section("SUGGESTED FIRST EMAIL", [company.outreach_subject ? `Subject: ${company.outreach_subject}` : "", company.outreach_email || ""].filter(Boolean).join("\n\n")),
      section("SOURCES", bullets((company.sources || []).slice(0, 15), (entry) => String(entry))),
      "OUR NOTES\n(Add your own findings here.)",
    ].filter(Boolean).join("\n\n");

    const notes = [
      company.brief,
      countries.length > 1 ? `Present in ${countries.length} countries: ${countries.map((entry) => entry.country).join(", ")}` : "",
      company.is_public ? `Publicly traded${company.ticker ? ` (${(company.stock_exchanges || []).join(", ")}: ${company.ticker})` : ""}` : "",
      company.employee_count ? `Approximately ${company.employee_count} staff` : "",
      company.pain_points?.length ? `Pain points: ${company.pain_points.join(" | ")}` : "",
      company.how_we_help?.length ? `How CDS Space helps: ${company.how_we_help.join(" | ")}` : "",
      company.competitors_local?.length ? `Local competitors: ${company.competitors_local.map((entry: any) => `${entry.type}: ${entry.name}`).join("; ")}` : "",
      company.competitors_global?.length ? `Global competitors: ${company.competitors_global.map((entry: any) => `${entry.type}: ${entry.name}`).join("; ")}` : "",
      company.activity_evidence ? `Activity: ${company.activity_evidence}` : "",
    ].filter(Boolean).join("\n\n").slice(0, 6000);

    const prospect = await glashMaybeOne<any>(
      `insert into public.deal_prospects (category,display_name,company_name,website,social_url,email,phone,location,notes,next_action,status,created_by,updated_by,research_brief)
       values ('potential_client',$1,$2,$3,$4,$5,$6,$7,$8,$9,'ready',$10,$10,$11) returning *`,
      [
        lead?.full_name || company.company_name,
        company.company_name,
        company.website,
        company.socials?.[0]?.url || null,
        lead?.email || company.emails?.[0]?.email || null,
        lead?.phone || company.phones?.[0] || null,
        [company.city, company.hq_country || company.country].filter(Boolean).join(", ") || null,
        notes,
        company.outreach_angle || "Send the researched outreach email.",
        actor,
        researchBrief,
      ],
    );
    // prospect_id is what records "this is on the checklist", so the review
    // status is free to keep saying how it got there.
    await glashQuery(`update public.prospect_companies set prospect_id=$2, review_status=$4, updated_by=$3, updated_at=now() where id=$1`, [id, prospect.id, actor, reviewStatus]);
    // The moment the pipeline starts counting from.
    await recordProspectEvent({
      prospectId: prospect.id, stage: "shortlisted", type: "Shortlisted from prospect generation",
      detail: company.company_name, source: "prospect-generation", actor,
      metadata: { company_id: id, deal_score: company.deal_score },
    });
    await logActivity({
      action: "deals.prospect_generation.promote", page: "deals/prospect-generation", resource_type: "prospect_company",
      resource_id: id, resource_label: company.company_name, metadata: { prospect_id: prospect.id },
    });
    return { prospect, company: { ...company, prospect_id: prospect.id, review_status: reviewStatus } } as const;
}

export async function POST(req: NextRequest) {
  const { session, denied } = await requireAdmin(req, PERMISSION);
  if (denied) return denied;
  if (!assertTrustedMutationOrigin(req)) return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  const actor = session?.email || "admin";

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const action = str(body.action, 40);

  try {
    if (action === "import") {
      const rate = checkIntelligenceRateLimit(`prospect-import:${actor}`, 60, 60 * 60 * 1000);
      if (!rate.allowed) return NextResponse.json({ error: "Import limit reached for this hour. Try again shortly." }, { status: 429 });

      const sourceKind = body.source_kind === "url" ? "url" : "text";
      const rawInput = str(body.raw_input, 4_000_000);
      const sourceUrl = str(body.source_url, 1000);
      const country = normalizeCountry(str(body.country, 60));
      const maxPages = intValue(body.max_pages, 5, 1, 40);
      const render = body.render === true;
      const scrolls = intValue(body.scrolls, 12, 0, 60);
      const clickSelector = str(body.click_selector, 200);
      if (sourceKind === "url" && !sourceUrl) return NextResponse.json({ error: "Paste the link to the company list." }, { status: 400 });
      if (sourceKind === "text" && !rawInput) return NextResponse.json({ error: "Paste the company details to research." }, { status: 400 });

      let candidates: CompanyCandidate[] = [];
      let warnings: string[] = [];
      let label = str(body.label, 180);
      if (sourceKind === "url") {
        const harvest = await harvestFromUrl(sourceUrl, { country, maxPages, render, scrolls, clickSelector: clickSelector || undefined });
        candidates = harvest.candidates;
        warnings = harvest.warnings;
        label = label || harvest.title || harvest.sourceUrl;
      } else {
        candidates = parseCompanyInput(rawInput, { country, source_url: sourceUrl || null });
        label = label || `Pasted list, ${new Date().toISOString().slice(0, 10)}`;
      }
      if (!candidates.length) {
        return NextResponse.json({
          error: warnings[0] || "No companies could be read from that input. Include company names or website addresses.",
          warnings,
        }, { status: 422 });
      }

      const entries = dedupeCandidates(candidates);
      const batch = await glashMaybeOne<any>(
        `insert into public.prospect_import_batches (label,source_kind,source_url,raw_input,status,discovered_count,created_by)
         values ($1,$2,$3,$4,'parsed',$5,$6) returning *`,
        [label, sourceKind, sourceUrl || null, sourceKind === "url" ? "" : rawInput.slice(0, 100_000), entries.length, actor],
      );
      const { created, merged, countriesAdded } = await mergeCandidates(entries, batch.id, actor);
      await glashQuery(
        `update public.prospect_import_batches set created_count=$2, duplicate_count=$3, updated_at=now() where id=$1`,
        [batch.id, created, merged],
      );
      await logActivity({
        action: "deals.prospect_generation.import", page: "deals/prospect-generation", resource_type: "prospect_batch",
        resource_id: batch.id, resource_label: label, metadata: { discovered: entries.length, created, merged, countriesAdded },
      });
      return NextResponse.json({
        batch: { ...batch, created_count: created, duplicate_count: merged },
        created, merged, countriesAdded, discovered: entries.length, warnings,
      });
    }

    if (action === "import_registry") {
      const rate = checkIntelligenceRateLimit(`prospect-registry:${actor}`, 600, 60 * 60 * 1000);
      if (!rate.allowed) return NextResponse.json({ error: "Registry import limit reached for this hour. Try again shortly." }, { status: 429 });

      const key = str(body.registry, 40);
      if (!registryFor(key)) return NextResponse.json({ error: "Unknown register." }, { status: 400 });
      const result = await runRegistryImport({ registryKey: key, actor, slices: intValue(body.slices, 3, 1, 10) });
      const batch = await glashMaybeOne<any>(`select * from public.prospect_import_batches where id=$1`, [result.batchId]);
      await logActivity({
        action: "deals.prospect_generation.registry", page: "deals/prospect-generation", resource_type: "prospect_batch",
        resource_id: result.batchId, resource_label: registryFor(key)!.label,
        metadata: { created: result.created, merged: result.merged, done: result.done },
      });
      return NextResponse.json({ ...result, batch });
    }

    if (action === "start_research") {
      // The run belongs to the server from here: closing the page no longer
      // stops it, and it keeps going until stopped or the admin signs out.
      const run = await startResearchRun({ actorKey: actor, actorName: body.actor_name ? String(body.actor_name) : null });
      void advanceResearchRun({ batches: 1 }).catch(() => undefined);
      return NextResponse.json({ ok: true, run });
    }

    if (action === "stop_research") {
      const stopped = await stopResearchRun({ reason: "an admin stopped it" });
      return NextResponse.json({ ok: true, stopped, run: await activeResearchRun() });
    }

    if (action === "research_status") {
      return NextResponse.json({ ok: true, run: await activeResearchRun() });
    }

    if (action === "enrich_batch") {
      const rate = checkIntelligenceRateLimit(`prospect-enrich:${actor}`, 2000, 60 * 60 * 1000);
      if (!rate.allowed) return NextResponse.json({ error: "Research limit reached for this hour. Try again shortly." }, { status: 429 });
      // The work itself lives in a library so the background runner can do the
      // same pass when nobody has the page open.
      const result = await runEnrichmentPass({
        limit: intValue(body.limit, DEFAULT_BATCH, 1, MAX_BATCH),
        actor,
        batchId: uuid(body.batch_id),
        companyId: uuid(body.id),
      });
      return NextResponse.json(result);
    }

    if (action === "requeue") {
      const id = uuid(body.id);
      // A retry goes to the front of the queue. Only companies that failed, or
      // that have sat in "running" for 15 minutes (a pass that died), are put
      // back; one being researched right now is left to finish.
      const rows = id
        ? await glashQuery<any>(`update public.prospect_companies set enrichment_status='queued', enrichment_attempts=0, enrichment_error=null, retry_requested_at=now(), updated_at=now() where id=$1 returning id`, [id])
        : await glashQuery<any>(`update public.prospect_companies set enrichment_status='queued', enrichment_attempts=0, enrichment_error=null, retry_requested_at=now(), updated_at=now()
            where enrichment_status = 'failed'
               or (enrichment_status = 'running' and updated_at < now() - interval '15 minutes')
            returning id`);
      return NextResponse.json({ requeued: rows.length });
    }

    if (action === "add_country") {
      const id = uuid(body.id);
      const country = normalizeCountry(str(body.country, 60));
      if (!id || !country) return NextResponse.json({ error: "A company and a country are required." }, { status: 400 });
      await glashQuery(
        `insert into public.prospect_company_countries (company_id,country,is_headquarters) values ($1,$2,false) on conflict do nothing`,
        [id, country],
      );
      const company = await glashMaybeOne<any>(`select * from public.prospect_companies where id=$1`, [id]);
      return NextResponse.json({ company });
    }

    if (action === "merge") {
      const keepId = uuid(body.keep_id);
      const mergeId = uuid(body.merge_id);
      if (!keepId || !mergeId || keepId === mergeId) return NextResponse.json({ error: "Two different companies are required." }, { status: 400 });
      const [keep, drop] = await Promise.all([
        glashMaybeOne<any>(`select * from public.prospect_companies where id=$1`, [keepId]),
        glashMaybeOne<any>(`select * from public.prospect_companies where id=$1`, [mergeId]),
      ]);
      if (!keep || !drop) return NextResponse.json({ error: "Company not found." }, { status: 404 });
      // Country rows, contacts, and the discarded spelling move to the kept row.
      await glashQuery(`insert into public.prospect_company_countries (company_id,country,registration_id,source_url)
        select $1, country, registration_id, source_url from public.prospect_company_countries where company_id=$2
        on conflict do nothing`, [keepId, mergeId]);
      await glashQuery(`update public.prospect_company_contacts set company_id=$1 where company_id=$2`, [keepId, mergeId]);
      await glashQuery(`insert into public.prospect_company_aliases (company_id,alias,name_key) values ($1,$2,$3) on conflict do nothing`,
        [keepId, drop.company_name, drop.name_key]);
      await glashQuery(`delete from public.prospect_companies where id=$1`, [mergeId]);
      return NextResponse.json({ ok: true });
    }

    if (action === "update_company") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ error: "A company is required." }, { status: 400 });
      const review = str(body.review_status, 20);
      if (review && !["new", "shortlisted", "promoted", "rejected"].includes(review)) {
        return NextResponse.json({ error: "Unknown review status." }, { status: 400 });
      }
      const company = await glashMaybeOne<any>(
        `update public.prospect_companies set review_status=coalesce($2, review_status), notes=coalesce($3, notes), updated_by=$4, updated_at=now()
         where id=$1 returning *`,
        [id, review || null, typeof body.notes === "string" ? str(body.notes, 4000) : null, actor],
      );
      if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

      // Shortlisting is what a reader means by "keep this one", so it puts the
      // company on the prospect checklist as well as flagging it here. Without
      // this the shortlist was a marker that lived only in this view and the
      // checklist stayed empty. Only a researched company can be copied over;
      // one still queued keeps the flag and joins the list once research lands.
      if (review === "shortlisted" && !company.prospect_id && company.enrichment_status === "enriched") {
        const promoted = await promoteCompanyToChecklist(id, actor, "shortlisted");
        if (!("error" in promoted)) return NextResponse.json({ company: promoted.company, prospect: promoted.prospect });
      }
      return NextResponse.json({ company });
    }

    if (action === "promote") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ error: "A company is required." }, { status: 400 });
      const result = await promoteCompanyToChecklist(id, actor);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(result);
    }

    if (action === "rewrite_outreach") {
      // A live audit plus a model call, so it is metered per admin.
      const rate = checkIntelligenceRateLimit(`prospect-rewrite:${actor}`, 60, 60 * 60 * 1000);
      if (!rate.allowed) return NextResponse.json({ error: "Rewrite limit reached for this hour. Try again shortly." }, { status: 429 });
      if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "AI writing is not configured on this deployment." }, { status: 503 });

      const id = uuid(body.id);
      if (!id) return NextResponse.json({ error: "A company is required." }, { status: 400 });
      const company = await glashMaybeOne<any>(`select * from public.prospect_companies where id=$1`, [id]);
      if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

      // The audit is re-run live rather than read from the last enrichment, so
      // the email quotes what is true today. A site fixed last week should not
      // be criticised for last month's markup.
      const audit = await auditForAiSearch({
        companyName: company.company_name,
        website: company.website,
        domain: company.domain,
        socials: Array.isArray(company.socials) ? company.socials : [],
        brandFindings: normalizeBrandFindings(company.brand_consistency),
      });

      const senderName = str(body.sender_name, 120).trim() || process.env.PROSPECT_SENDER_NAME || session?.name || "";
      const senderTitle = process.env.PROSPECT_SENDER_TITLE || "Founder and CEO, CDS Space";

      const prompt = [
        `Company: ${company.company_name}`,
        company.website ? `Website: ${company.website}` : "Website: none found",
        company.industry ? `Industry: ${company.industry}` : "",
        company.country ? `Country: ${company.country}` : "",
        company.employee_range ? `Size: ${company.employee_range}` : "",
        `What we already know about them: ${str(company.brief, 1200) || "little"}`,
        "",
        "AUDIT FINDINGS, observed live on their properties just now. These are facts. Use them and nothing else:",
        ...audit.findings.map((finding, index) => `${index + 1}. [${finding.severity}] [${finding.area}] ${finding.title}: ${finding.detail} (observed at ${finding.evidence})`),
        audit.strengths.length ? `\nWhat they are already doing well: ${audit.strengths.join("; ")}` : "",
        "",
        `CDS Space services that could be offered: ${SERVICE_NAMES.join("; ")}`,
        `Signature: ${senderName || "the sender"}, ${senderTitle}`,
      ].filter(Boolean).join("\n");

      const { text } = await chatComplete([
        {
          role: "system",
          content: [
            "You are the founder and CEO of CDS Space, a branding, design and digital product agency, writing a first email to a company you have never spoken to.",
            "You are writing as the CEO, in the first person, personally. Not a sales rep, not a template, not a team. You looked at their business yourself and you are telling them what you saw.",
            "The opening line must be audacious and specific enough that stopping reading feels like a risk. Lead with the single most costly thing the audit found, stated as a plain observation about THEIR business, naming the page or platform it was seen on. Never open with a greeting about yourself, your agency, or how you came across them.",
            "Be direct and confident, never rude, never flattering, never desperate. Respect the reader as a peer: you are one business owner telling another something they would want to know.",
            "Everything you assert must come from the supplied audit findings. Never invent a statistic, a client name, a revenue figure, a competitor claim, or a finding that is not listed.",
            "Where the audit lists something they do well, acknowledge it in one clause before the problem. It proves you actually looked.",
            "Explain the cost in terms of customers, credibility, or being absent from the answers buyers now get from AI assistants. Do not use jargon: say what it means for their business, not what the technical defect is called.",
            "Close with one specific, low-friction next step: a short call, or an offer to send the full audit. Never ask for a meeting to 'discuss synergies' or anything that sounds like a form letter.",
            "160 to 220 words for the body. Short paragraphs. No bullet points, no headings, no markdown.",
            "Sign off with the sender's name and title exactly as supplied. Never write a placeholder such as [Your Name].",
            "Write in plain professional English. Never use em dashes.",
            "The subject line is at most 60 characters, states the specific observation, and reads like a person wrote it, never like a campaign.",
            "Return only JSON: {subject, message}.",
          ].join(" "),
        },
        { role: "user", content: prompt },
      ], { temperature: 0.7, max_tokens: 900, response_format: { type: "json_object" } });

      let written: { subject?: unknown; message?: unknown } = {};
      try { written = JSON.parse(text); } catch { return NextResponse.json({ error: "The AI reply could not be read. Try again." }, { status: 502 }); }
      const subject = str(written.subject, 300).trim();
      const message = str(written.message, 20_000).trim();
      if (!subject || !message) return NextResponse.json({ error: "The AI did not return a usable email. Try again." }, { status: 502 });

      // Kept on the company so the next person to open it starts from the
      // rewritten version rather than the original enrichment draft.
      await glashQuery(
        `update public.prospect_companies set outreach_subject=$2, outreach_email=$3, updated_by=$4, updated_at=now() where id=$1`,
        [id, subject, message, actor],
      );

      return NextResponse.json({ subject, message, audit });
    }

    if (action === "find_emails") {
      // A live crawl per click, so it is rate limited per admin rather than
      // per company: the cost is ours, whichever company is being searched.
      const rate = checkIntelligenceRateLimit(`prospect-email-hunt:${actor}`, 40, 60 * 60 * 1000);
      if (!rate.allowed) return NextResponse.json({ error: "Email search limit reached for this hour. Try again shortly." }, { status: 429 });

      const id = uuid(body.id);
      if (!id) return NextResponse.json({ error: "A company is required." }, { status: 400 });
      const company = await glashMaybeOne<any>(`select * from public.prospect_companies where id=$1`, [id]);
      if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

      const report = await huntCompanyEmails({
        companyName: company.company_name,
        domain: company.domain,
        website: company.website,
        country: company.country || company.hq_country,
      });

      // Merge into what enrichment already found rather than replacing it: an
      // address discovered earlier is not invalidated by a later search.
      const existing: Array<{ email: string; source_url: string; kind: string }> = Array.isArray(company.emails) ? company.emails : [];
      const merged = [...existing];
      let added = 0;
      for (const found of report.emails) {
        if (merged.some((entry) => String(entry.email).toLowerCase() === found.email)) continue;
        merged.push({ email: found.email, source_url: found.source_url, kind: found.kind });
        added += 1;
      }
      if (added) {
        await glashQuery(
          `update public.prospect_companies set emails=$2::jsonb, updated_by=$3, updated_at=now() where id=$1`,
          [id, JSON.stringify(merged), actor],
        );
      }

      return NextResponse.json({
        found: report.emails,
        added,
        emails: merged,
        visited: report.visited,
        channels: report.channels,
        exhausted: report.exhausted,
      });
    }

    if (action === "add_email") {
      const id = uuid(body.id);
      const email = str(body.email, 320).trim().toLowerCase();
      if (!id) return NextResponse.json({ error: "A company is required." }, { status: 400 });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "That is not a valid email address." }, { status: 400 });

      const company = await glashMaybeOne<any>(`select * from public.prospect_companies where id=$1`, [id]);
      if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });
      const existing: Array<{ email: string; source_url: string; kind: string }> = Array.isArray(company.emails) ? company.emails : [];
      if (existing.some((entry) => String(entry.email).toLowerCase() === email)) {
        return NextResponse.json({ emails: existing, added: 0 });
      }
      // Recorded as entered by hand, so nobody later mistakes it for something
      // the research actually verified.
      const merged = [...existing, { email, source_url: `manual:${actor}`, kind: "manual" }];
      await glashQuery(
        `update public.prospect_companies set emails=$2::jsonb, updated_by=$3, updated_at=now() where id=$1`,
        [id, JSON.stringify(merged), actor],
      );
      return NextResponse.json({ emails: merged, added: 1 });
    }

    if (action === "send_outreach") {
      const rate = checkIntelligenceRateLimit(`prospect-outreach:${actor}`, 120, 60 * 60 * 1000);
      if (!rate.allowed) return NextResponse.json({ error: "Outreach limit reached for this hour. Try again shortly." }, { status: 429 });

      const id = uuid(body.id);
      if (!id) return NextResponse.json({ error: "A company is required." }, { status: 400 });
      const company = await glashMaybeOne<any>(`select * from public.prospect_companies where id=$1`, [id]);
      if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

      const recipients = Array.from(new Set(
        (Array.isArray(body.recipients) ? body.recipients : [])
          .map((value: unknown) => str(value, 320).trim().toLowerCase())
          .filter((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)),
      )) as string[];
      if (!recipients.length) return NextResponse.json({ error: "Add at least one valid email address." }, { status: 400 });
      if (recipients.length > 10) return NextResponse.json({ error: "Send to at most 10 addresses at a time." }, { status: 400 });

      const subject = str(body.subject, 300).trim();
      const message = str(body.message, 20_000).trim();
      if (!subject) return NextResponse.json({ error: "A subject is required." }, { status: 400 });
      if (!message) return NextResponse.json({ error: "The email body is empty." }, { status: 400 });

      const html = brandedEmailHtml(
        message
          .split(/\n{2,}/)
          .map((paragraph) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#334155;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
          .join(""),
        { preheader: subject.slice(0, 120) },
      );

      // One message per recipient. A shared To line would show every prospect
      // the others we are approaching.
      const failed: string[] = [];
      for (const to of recipients) {
        try {
          await sendEmail({ to, subject, html, text: message, fromName: "CDS Space" });
        } catch {
          failed.push(to);
        }
      }
      const sent = recipients.length - failed.length;
      if (!sent) return NextResponse.json({ error: "The email could not be sent to any of the addresses." }, { status: 502 });

      await logActivity({
        action: "deals.prospect_generation.outreach", page: "deals/prospect-generation", resource_type: "prospect_company",
        resource_id: id, resource_label: company.company_name,
        metadata: { sent, failed: failed.length, recipients },
      });
      // Outreach only moves the pipeline for a company already on the checklist.
      if (company.prospect_id) {
        await recordProspectEvent({
          prospectId: company.prospect_id, stage: "contacted", type: "Outreach email sent",
          detail: `${subject} (${sent} of ${recipients.length} delivered)`, source: "prospect-generation", actor,
          metadata: { recipients, sent, failed: failed.length },
        });
      }

      return NextResponse.json({ sent, failed });
    }

    if (action === "delete_company") {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ error: "A company is required." }, { status: 400 });
      await glashQuery(`delete from public.prospect_companies where id=$1`, [id]);
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_batch") {
      const id = uuid(body.batch_id);
      if (!id) return NextResponse.json({ error: "A batch is required." }, { status: 400 });
      await glashQuery(`delete from public.prospect_companies where batch_id=$1 and review_status <> 'promoted'`, [id]);
      await glashQuery(`delete from public.prospect_import_batches where id=$1`, [id]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed." }, { status: 500 });
  }
}
