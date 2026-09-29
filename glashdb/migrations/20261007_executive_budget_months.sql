-- Monthly budgets on the Executive Board. Every budget line now belongs to one
-- calendar month of one year, so each month can be planned and tracked on its
-- own and a year can be rolled up into the annual operations budget.

alter table public.executive_budgets
  add column if not exists budget_year smallint,
  add column if not exists budget_month smallint;

-- Existing lines take the month of their start date when one was set, and
-- otherwise the month they were entered in (Lagos time).
update public.executive_budgets
   set budget_year = extract(year from coalesce(period_start, (created_at at time zone 'Africa/Lagos')::date))::smallint,
       budget_month = extract(month from coalesce(period_start, (created_at at time zone 'Africa/Lagos')::date))::smallint
 where budget_year is null or budget_month is null;

-- Defaults keep older app builds, which do not send a month, saving into the
-- current month instead of failing.
alter table public.executive_budgets
  alter column budget_year set default extract(year from (now() at time zone 'Africa/Lagos'))::smallint,
  alter column budget_month set default extract(month from (now() at time zone 'Africa/Lagos'))::smallint,
  alter column budget_year set not null,
  alter column budget_month set not null;

alter table public.executive_budgets
  drop constraint if exists executive_budgets_budget_month_check;
alter table public.executive_budgets
  add constraint executive_budgets_budget_month_check check (budget_month between 1 and 12);

alter table public.executive_budgets
  drop constraint if exists executive_budgets_budget_year_check;
alter table public.executive_budgets
  add constraint executive_budgets_budget_year_check check (budget_year between 2000 and 2100);

create index if not exists executive_budgets_period_idx
  on public.executive_budgets (budget_year, budget_month);
