import "dotenv/config";
import pg from "pg";
const { writeFirstEmail } = await import("../src/lib/prospect-outreach-writer.ts");
const { findBannedPhrases, JARGON } = await import("../src/lib/ai/cds-voice.ts");
const c = new pg.Client({ connectionString: process.env.GLASHDB_DIRECT_URL||process.env.DIRECT_URL||process.env.GLASHDB_DATABASE_URL||process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
const { rows } = await c.query(`select distinct on (key) * from (
  select *, case when company_name ilike 'BERKSHIRE HATHAWAY%' then 'b' when company_name ilike 'TAKEDA PHARMACEUTICAL%' then 't' when domain ilike '%mysolstice%' then 's' end key
  from prospect_companies where (company_name ilike 'BERKSHIRE HATHAWAY%' or company_name ilike 'TAKEDA PHARMACEUTICAL%' or domain ilike '%mysolstice%') and enrichment_status='enriched') x order by key, deal_score desc`);
await c.end();
for (const row of rows) {
  const email = await writeFirstEmail({ company: {
    company_name: row.company_name, website: row.website, industry: row.industry, country: row.hq_country || row.country,
    brief: row.brief, employee_range: row.employee_range, is_public: row.is_public,
    website_findings: row.website_findings || [], pain_points: row.pain_points || [],
    brand_findings: (row.brand_consistency || []).map((b) => `${b.area} (${b.status}): ${b.detail}`),
  } });
  const body = email.message.split("\n\n").slice(1, -1).join(" ");
  console.log(`\n===== ${row.company_name}  [${body.split(/\s+/).length} words, banned: ${findBannedPhrases(email.message).join(",") || "none"}, jargon: ${(email.message.match(JARGON)||["none"])[0]}, em dash: ${/—/.test(email.message)}]`);
  console.log(`Subject: ${email.subject}\n\n${email.message}`);
}
process.exit(0);
