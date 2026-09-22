-- Pipeline rows link back to the research company that created them. This
-- partial index keeps that reverse lookup fast as the company directory grows.

begin;

create index if not exists prospect_companies_prospect_idx
  on public.prospect_companies (prospect_id)
  where prospect_id is not null;

commit;
