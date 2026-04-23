-- ============================================
-- CDS Space: Expenditure title + category suggestions
-- Idempotent. Run in Supabase SQL editor.
-- ============================================

create extension if not exists "pgcrypto";

create table if not exists public.finance_expenditure_titles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  usage_count int not null default 1,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create table if not exists public.finance_expenditure_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  usage_count int not null default 1,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

-- Indexes so `ILIKE 'f%'` searches are fast without a full scan.
create index if not exists idx_exp_titles_lower on public.finance_expenditure_titles (lower(name));
create index if not exists idx_exp_titles_usage on public.finance_expenditure_titles (usage_count desc);
create index if not exists idx_exp_cats_lower   on public.finance_expenditure_categories (lower(name));
create index if not exists idx_exp_cats_usage   on public.finance_expenditure_categories (usage_count desc);

alter table public.finance_expenditure_titles     enable row level security;
alter table public.finance_expenditure_categories enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'finance_expenditure_titles' and policyname = 'exp_titles_all') then
    create policy exp_titles_all on public.finance_expenditure_titles for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'finance_expenditure_categories' and policyname = 'exp_cats_all') then
    create policy exp_cats_all on public.finance_expenditure_categories for all using (true) with check (true);
  end if;
end $$;

-- Seed the two tables from whatever's already in finance_expenditures so the
-- dropdowns aren't empty on first load.
insert into public.finance_expenditure_titles (name, usage_count)
select title, count(*)::int
from public.finance_expenditures
where title is not null and length(trim(title)) > 0
group by title
on conflict (name) do update set usage_count = excluded.usage_count;

insert into public.finance_expenditure_categories (name, usage_count)
select category, count(*)::int
from public.finance_expenditures
where category is not null and length(trim(category)) > 0
group by category
on conflict (name) do update set usage_count = excluded.usage_count;

-- Starter categories so a brand-new workspace isn't empty.
insert into public.finance_expenditure_categories (name)
values ('Operations'), ('Utility'), ('Travel'), ('Office'), ('Marketing'), ('Subscription'), ('Equipment'), ('Salary'), ('Transportation')
on conflict (name) do nothing;

insert into public.finance_expenditure_titles (name)
values ('Fuel'), ('Electricity bill'), ('Internet subscription'), ('Office supplies'), ('Transport'), ('Lunch')
on conflict (name) do nothing;
