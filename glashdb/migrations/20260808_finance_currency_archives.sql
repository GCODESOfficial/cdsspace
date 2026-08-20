begin;

alter table if exists public.finance_invoices
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists deletion_reason text;

create index if not exists finance_invoices_active_created_idx
  on public.finance_invoices (created_at desc)
  where deleted_at is null;

create table if not exists public.finance_preferences (
  id text primary key default 'global' check (id = 'global'),
  display_currency text not null default 'NGN'
    check (display_currency in ('NGN','USD','GBP','EUR','RWF','CNY','AED')),
  default_currency text not null default 'NGN'
    check (default_currency in ('NGN','USD','GBP','EUR','RWF','CNY','AED')),
  exchange_rates jsonb not null default '{"USD":1,"NGN":1600,"GBP":0.79,"EUR":0.92,"RWF":1300,"CNY":7.2,"AED":3.67}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.finance_preferences (id, display_currency, default_currency)
values ('global', 'NGN', 'NGN')
on conflict (id) do nothing;

alter table public.finance_preferences enable row level security;

drop policy if exists "finance_preferences_authenticated_read" on public.finance_preferences;
create policy "finance_preferences_authenticated_read"
  on public.finance_preferences for select
  to authenticated
  using (true);

commit;
