-- The directory list sorts by deal score then recency by default, with no
-- filter applied. There was no index covering that ordering, so opening the page
-- sorted the whole table. At a million rows that is seconds per page.

begin;

create index if not exists prospect_companies_default_sort_idx
  on public.prospect_companies (deal_score desc, updated_at desc);

-- The alphabetical and staff orderings are offered in the same list, so they get
-- the same treatment rather than falling back to a full sort.
create index if not exists prospect_companies_name_sort_idx
  on public.prospect_companies (name_key asc);
create index if not exists prospect_companies_created_sort_idx
  on public.prospect_companies (created_at desc);

commit;
