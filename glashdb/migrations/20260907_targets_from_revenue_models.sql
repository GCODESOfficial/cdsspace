-- Every revenue model becomes a monthly target automatically.
--
-- Revenue models are stated both monthly and yearly, but a target is a monthly
-- commitment, so each active model gets one target per calendar month carrying
-- its monthly value. Last month's target stays as it was, which is what makes a
-- run of months into a record of how the model actually performed.
--
-- A target created this way is marked, so the sync can refresh the figure and
-- the name without touching anything the team has typed: progress, status,
-- owner, and notes are theirs.

begin;

alter table public.executive_targets
  add column if not exists source text not null default 'manual',
  add column if not exists period_month date;

alter table public.executive_targets
  drop constraint if exists executive_targets_source_check;
alter table public.executive_targets
  add constraint executive_targets_source_check
  check (source in ('manual', 'revenue_model'));

-- One generated target per model per month, which is what makes the sync safe
-- to run on every page load.
create unique index if not exists executive_targets_model_month_key
  on public.executive_targets (model_id, period_month)
  where source = 'revenue_model';

create index if not exists executive_targets_period_idx
  on public.executive_targets (period_month desc nulls last, status);

comment on column public.executive_targets.source is
  'manual for a target someone wrote, revenue_model for one generated from a revenue model.';
comment on column public.executive_targets.period_month is
  'First day of the month this target covers.';

commit;
