-- Recurring budget lines. A line repeated into the following months shares a
-- recurrence group with its copies, so repeating it again never adds a second
-- copy to a month that already has one.

alter table public.executive_budgets
  add column if not exists recurrence_group_id uuid;

create index if not exists executive_budgets_recurrence_idx
  on public.executive_budgets (recurrence_group_id, budget_year, budget_month)
  where recurrence_group_id is not null;
