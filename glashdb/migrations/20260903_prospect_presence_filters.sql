-- Indexes for the two quick filters on the directory list: hiding companies the
-- register already calls inactive, and showing only those with a website.
-- Both are partial indexes, so they stay small even at several million rows.

begin;

create index if not exists prospect_companies_live_sort_idx
  on public.prospect_companies (deal_score desc, updated_at desc)
  where activity_status <> 'inactive';

create index if not exists prospect_companies_with_site_idx
  on public.prospect_companies (deal_score desc, updated_at desc)
  where website is not null;

create index if not exists prospect_companies_live_with_site_idx
  on public.prospect_companies (deal_score desc, updated_at desc)
  where activity_status <> 'inactive' and website is not null;

commit;
