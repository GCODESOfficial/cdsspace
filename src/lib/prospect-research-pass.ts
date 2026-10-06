import "server-only";

import { glashQuery } from "@/lib/glashdb/postgres";
import { companyNameKey } from "@/lib/prospect-directory";
import { enrichCompany } from "@/lib/prospect-enrichment";

/**
 * One pass of prospect research.
 *
 * This used to live inside the admin route, so research only moved while an
 * admin kept the page open: closing the tab part way through a directory of
 * millions simply stopped it. The work lives here so the server can carry on
 * running it on its own.
 *
 * Rows are claimed in a single statement, so two passes, whether from an open
 * page or from the background runner, can never research the same company.
 */
export type ProcessedCompany = { id: string; company_name: string; status: string; deal_score?: number };

export async function runEnrichmentPass(input: {
  limit: number;
  actor: string;
  batchId?: string | null;
  companyId?: string | null;
}): Promise<{ processed: ProcessedCompany[]; remaining: number }> {
  const limit = input.limit;
  const actor = input.actor;
  const batchId = input.batchId || null;
  const companyId = input.companyId || null;
  const scope = companyId ? "and id = $2" : batchId ? "and batch_id = $2" : "";
  // Claiming inside one statement stops two open tabs researching the same row.
  // Retried companies are claimed first, then the rest oldest first, so a
  // retry takes effect on the next pass even while a run is going.
  const claim = (order: string, take: number) => glashQuery<any>(
    `update public.prospect_companies set enrichment_status='running', enrichment_attempts = enrichment_attempts + 1, updated_at=now()
     where id in (
       select id from public.prospect_companies
       where enrichment_status = 'queued' ${scope} ${order}
       limit $1
       for update skip locked
     ) returning *`,
    companyId ? [take, companyId] : batchId ? [take, batchId] : [take],
  );
  const retried = await claim("and retry_requested_at is not null order by retry_requested_at", limit);
  const claimed = retried.length < limit
    ? [...retried, ...await claim("order by created_at", limit - retried.length)]
    : retried;

  const processed: Array<{ id: string; company_name: string; status: string; deal_score?: number }> = [];
  for (const row of claimed) {
    try {
      const result = await enrichCompany({
        company_name: row.company_name,
        domain: row.domain,
        website: row.website,
        country: row.hq_country || row.country,
        industry: row.industry,
      });
      await glashQuery(
        `update public.prospect_companies set
           company_name=$2, name_key=$3, domain=coalesce($4, domain), website=$5, country=$6, city=$7, industry=$8,
           employee_range=$9, employee_count=$10, size_band=$11, founded_year=$12,
           is_public=$13, stock_exchanges=$14::jsonb, ticker=$15, is_startup=$16,
           activity_status=$17, activity_evidence=$18,
           website_status=$19, website_score=$20, website_findings=$21::jsonb, issues=$41::text[],
           brand_consistency=$38::jsonb, domain_variants=$39::jsonb, dns_contacts=$40::jsonb,
           socials=$22::jsonb, emails=$23::jsonb, phones=$24::jsonb,
           brief=$25, pain_points=$26::jsonb, how_we_help=$27::jsonb, service_fit=$28::jsonb,
           competitors_local=$29::jsonb, competitors_global=$30::jsonb,
           outreach_angle=$31, outreach_subject=$32, outreach_email=$33,
           deal_score=$34, priority=$35, sources=$36::jsonb,
           enrichment_status='enriched', enrichment_error=null, enriched_at=now(), retry_requested_at=null, updated_by=$37, updated_at=now()
         where id=$1`,
        [
          row.id, result.company_name, companyNameKey(result.company_name), result.domain, result.website,
          result.country, result.city, result.industry,
          result.employee_range, result.employee_count, result.size_band, result.founded_year,
          result.is_public, JSON.stringify(result.stock_exchanges), result.ticker, result.is_startup,
          result.activity_status, result.activity_evidence,
          result.website_status, result.website_score, JSON.stringify(result.website_findings),
          JSON.stringify(result.socials), JSON.stringify(result.emails), JSON.stringify(result.phones),
          result.brief, JSON.stringify(result.pain_points), JSON.stringify(result.how_we_help), JSON.stringify(result.service_fit),
          JSON.stringify(result.competitors_local), JSON.stringify(result.competitors_global),
          result.outreach_angle, result.outreach_subject, result.outreach_email,
          result.deal_score, result.priority, JSON.stringify(result.sources), actor,
          JSON.stringify(result.brand_consistency), JSON.stringify(result.domain_variants), JSON.stringify(result.dns_contacts),
          result.issues,
        ],
      );

      // Research often reveals further countries of operation. They attach to
      // this one company row rather than creating duplicates per country.
      for (const country of result.countries) {
        await glashQuery(
          `insert into public.prospect_company_countries (company_id,country,is_headquarters,source_url)
           values ($1,$2,$3,$4) on conflict do nothing`,
          [row.id, country, country === result.country, result.website],
        );
      }

      await glashQuery(`delete from public.prospect_company_contacts where company_id=$1`, [row.id]);
      for (const contact of result.contacts) {
        await glashQuery(
          `insert into public.prospect_company_contacts (company_id,full_name,job_title,seniority,email,email_confidence,phone,linkedin_url,source_url)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [row.id, contact.full_name, contact.job_title, contact.seniority, contact.email, contact.email_confidence, contact.phone, contact.linkedin_url, contact.source_url],
        );
      }
      processed.push({ id: row.id, company_name: result.company_name, status: "enriched", deal_score: result.deal_score });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Research failed.";
      await glashQuery(
        `update public.prospect_companies set enrichment_status = case when enrichment_attempts >= 3 then 'failed' else 'queued' end,
         enrichment_error=$2, updated_at=now() where id=$1`,
        [row.id, message.slice(0, 500)],
      );
      processed.push({ id: row.id, company_name: row.company_name, status: "failed" });
    }
  }


  const [counter] = await glashQuery<{ value: string | number }>(
    `select value from public.prospect_directory_counters where bucket = 'enrichment:queued'`,
  );
  return { processed, remaining: Number(counter?.value || 0) };
}
