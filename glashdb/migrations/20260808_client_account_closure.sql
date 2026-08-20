begin;

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists closed_at timestamptz,
  add column if not exists closure_reason text,
  add column if not exists closure_requested_email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'closed', 'suspended'));
  end if;
end
$$;

create table if not exists public.client_account_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  account_email text not null,
  reason text not null,
  retained_business_records boolean not null default true,
  closed_at timestamptz not null default now(),
  reopened_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists client_account_closures_user_closed_idx
  on public.client_account_closures(user_id, closed_at desc);

alter table public.client_account_closures enable row level security;

commit;
