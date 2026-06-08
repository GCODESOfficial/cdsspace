-- CDS Space GlashDB dashboard schema repair.
-- Non-destructive: creates only missing support tables/columns and grants access.

create extension if not exists "pgcrypto";

create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  company text,
  budget_range text,
  message text,
  how_heard text,
  file_urls text[] default '{}',
  status text not null default 'new',
  notes text,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consultation_requests
  add column if not exists company text,
  add column if not exists budget_range text,
  add column if not exists message text,
  add column if not exists how_heard text,
  add column if not exists file_urls text[] default '{}',
  add column if not exists status text not null default 'new',
  add column if not exists notes text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consultation_requests_status_check'
      and conrelid = 'public.consultation_requests'::regclass
  ) then
    alter table public.consultation_requests
      add constraint consultation_requests_status_check
      check (status in ('new','reviewing','scheduled','completed','archived'));
  end if;
end $$;

create index if not exists idx_consultation_requests_status
  on public.consultation_requests(status);
create index if not exists idx_consultation_requests_created_at
  on public.consultation_requests(created_at desc);

create or replace function public.consultation_requests_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists consultation_requests_updated_at_trigger on public.consultation_requests;
create trigger consultation_requests_updated_at_trigger
  before update on public.consultation_requests
  for each row execute function public.consultation_requests_set_updated_at();

create table if not exists public.merch_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null default 'Merch order',
  status text not null default 'PENDING',
  quantity integer,
  amount numeric(14,2),
  currency text not null default 'NGN',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.merch_orders
  add column if not exists user_id uuid,
  add column if not exists title text not null default 'Merch order',
  add column if not exists status text not null default 'PENDING',
  add column if not exists quantity integer,
  add column if not exists amount numeric(14,2),
  add column if not exists currency text not null default 'NGN',
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_merch_orders_user_created
  on public.merch_orders(user_id, created_at desc);
create index if not exists idx_merch_orders_status
  on public.merch_orders(status);

create table if not exists public.recurring_designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null default 'Recurring design',
  status text not null default 'ACTIVE',
  billing_cycle text,
  amount numeric(14,2),
  currency text not null default 'NGN',
  next_due_date date,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recurring_designs
  add column if not exists user_id uuid,
  add column if not exists title text not null default 'Recurring design',
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists billing_cycle text,
  add column if not exists amount numeric(14,2),
  add column if not exists currency text not null default 'NGN',
  add column if not exists next_due_date date,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_recurring_designs_user_created
  on public.recurring_designs(user_id, created_at desc);
create index if not exists idx_recurring_designs_status
  on public.recurring_designs(status);

do $$
declare
  t text;
  dashboard_tables text[] := array[
    'consultation_requests',
    'merch_orders',
    'recurring_designs',
    'project_assignments',
    'project_documents',
    'project_tasks',
    'project_task_comments',
    'project_task_attachments',
    'project_approvals',
    'project_activity_events',
    'project_calendar_events',
    'team_cdocs_activity'
  ];
begin
  foreach t in array dashboard_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'allow_all_' || t, t);
      execute format(
        'create policy %I on public.%I for all using (true) with check (true)',
        'allow_all_' || t,
        t
      );
      execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', t);
    end if;
  end loop;
end $$;
