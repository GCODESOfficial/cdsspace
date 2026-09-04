-- The five issues the directory sells against, stored per company so the list
-- can filter on them without reading the findings prose row by row.

begin;

alter table public.prospect_companies
  add column if not exists issues text[] not null default '{}';

-- The filters ask "which companies have this issue", which is exactly what a
-- GIN index over the array answers.
create index if not exists prospect_companies_issues_idx
  on public.prospect_companies using gin (issues);

commit;
