-- Positive finance inflows for CDS Space account management.
-- Additive and non-destructive: legacy subscription records remain untouched.

create table if not exists public.finance_inflows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references public.finance_projects(id) on delete set null,
  title text not null,
  source text null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'NGN',
  received_on date not null default current_date,
  payment_method text null,
  reference text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_inflows
  add column if not exists project_id uuid null references public.finance_projects(id) on delete set null,
  add column if not exists title text,
  add column if not exists source text,
  add column if not exists amount numeric(14,2),
  add column if not exists currency text not null default 'NGN',
  add column if not exists received_on date not null default current_date,
  add column if not exists payment_method text,
  add column if not exists reference text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.finance_inflows
  alter column title set not null,
  alter column amount set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finance_inflows_amount_check'
      and conrelid = 'public.finance_inflows'::regclass
  ) then
    alter table public.finance_inflows
      add constraint finance_inflows_amount_check check (amount >= 0);
  end if;
end $$;

create index if not exists finance_inflows_received_on_idx
  on public.finance_inflows (received_on desc);

create index if not exists finance_inflows_project_id_idx
  on public.finance_inflows (project_id);

create or replace function public.set_finance_inflows_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_finance_inflows_updated_at on public.finance_inflows;
create trigger set_finance_inflows_updated_at
  before update on public.finance_inflows
  for each row execute function public.set_finance_inflows_updated_at();

alter table public.finance_inflows enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'finance_inflows'
      and policyname = 'finance_inflows_admin_all'
  ) then
    create policy finance_inflows_admin_all
      on public.finance_inflows
      for all
      to public
      using (true)
      with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.finance_inflows to anon, authenticated, service_role;
