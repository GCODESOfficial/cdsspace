-- Searching the directory ran as `company_name ilike '%term%'` with no index
-- able to serve it, so every keystroke scanned the whole table. At millions of
-- rows that is seconds per search, which is why a typed name appeared to match
-- nothing and then, once the slow response finally landed, the unfiltered list
-- came back over it. Trigram indexes make the same search an index lookup.

begin;

create extension if not exists pg_trgm;

-- Name, domain and industry are the three columns the search box reads. A GIN
-- trigram index serves ilike '%term%' on each of them, so a term appearing
-- anywhere inside a name is found without a scan.
create index if not exists prospect_companies_name_trgm_idx
  on public.prospect_companies using gin (company_name gin_trgm_ops);
create index if not exists prospect_companies_name_key_trgm_idx
  on public.prospect_companies using gin (name_key gin_trgm_ops);
create index if not exists prospect_companies_domain_trgm_idx
  on public.prospect_companies using gin (domain gin_trgm_ops);
create index if not exists prospect_companies_industry_trgm_idx
  on public.prospect_companies using gin (industry gin_trgm_ops);

-- Alternate names are searched with the same query, so a company found under a
-- spelling from another country list still answers to the name typed here.
create index if not exists prospect_company_aliases_alias_trgm_idx
  on public.prospect_company_aliases using gin (alias gin_trgm_ops);
create index if not exists prospect_company_aliases_key_trgm_idx
  on public.prospect_company_aliases using gin (name_key gin_trgm_ops);
create index if not exists prospect_company_aliases_company_idx
  on public.prospect_company_aliases (company_id);

-- The A to Z strip filters with `name_key like 'a%'`. The plain btree index on
-- name_key only serves that under the C collation, so give the prefix match an
-- index that works whatever the database collation is.
create index if not exists prospect_companies_name_key_prefix_idx
  on public.prospect_companies (name_key text_pattern_ops);

-- Remaining list filters that had no index of their own.
create index if not exists prospect_companies_activity_idx
  on public.prospect_companies (activity_status, deal_score desc);
create index if not exists prospect_companies_website_status_idx
  on public.prospect_companies (website_status, deal_score desc);
create index if not exists prospect_companies_priority_idx
  on public.prospect_companies (priority, deal_score desc);
create index if not exists prospect_companies_employees_idx
  on public.prospect_companies (employee_count desc nulls last);
create index if not exists prospect_companies_exchanges_idx
  on public.prospect_companies using gin (stock_exchanges jsonb_path_ops);

commit;
