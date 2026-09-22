begin;

-- Future-facing company expansion plans live separately from operating
-- budgets, whose actual spend is already tracked on executive_budgets.
create table if not exists public.executive_expansion_budgets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  expansion_type text not null default 'new_market'
    check (expansion_type in ('new_market', 'new_office', 'hiring', 'technology', 'product', 'infrastructure', 'acquisition', 'other')),
  location text,
  rationale text,
  target_start date not null,
  target_end date,
  currency text not null default 'USD',
  estimated_amount numeric(16,2) not null default 0 check (estimated_amount >= 0),
  contingency_amount numeric(16,2) not null default 0 check (contingency_amount >= 0),
  committed_amount numeric(16,2) not null default 0 check (committed_amount >= 0),
  funding_source text,
  owner text,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'idea'
    check (status in ('idea', 'researching', 'planned', 'approved', 'on_hold', 'launched', 'cancelled')),
  expected_outcome text,
  notes text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executive_expansion_budgets_dates_check
    check (target_end is null or target_end >= target_start)
);

create index if not exists executive_expansion_budgets_schedule_idx
  on public.executive_expansion_budgets (target_start, status);

create index if not exists executive_expansion_budgets_status_idx
  on public.executive_expansion_budgets (status, priority, target_start);

-- One evolving, protected server draft per administrator. The payload may
-- represent either a new plan or an unfinished edit of an existing plan.
create table if not exists public.executive_expansion_budget_drafts (
  actor_id text primary key,
  actor_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.executive_expansion_budgets enable row level security;
alter table public.executive_expansion_budget_drafts enable row level security;

grant select, insert, update, delete on table public.executive_expansion_budgets to service_role;
grant select, insert, update, delete on table public.executive_expansion_budget_drafts to service_role;

comment on table public.executive_expansion_budgets is
  'Future company expansion initiatives and their forecast funding requirements.';

comment on table public.executive_expansion_budget_drafts is
  'One recoverable server-side expansion-budget draft per administrator.';

commit;

notify pgrst, 'reload schema';
