-- Unify manually managed CRM clients with authenticated platform profiles.
-- Manual records remain the CRM source of truth and can be linked to exactly
-- one platform account without deleting their history.

create extension if not exists "pgcrypto";

alter table public.clients
  add column if not exists platform_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists account_linked_at timestamptz,
  add column if not exists account_linked_by text,
  add column if not exists merged_at timestamptz;

create unique index if not exists idx_clients_platform_user_unique
  on public.clients(platform_user_id)
  where platform_user_id is not null;

-- Keep clean directories unique without making a deployment fail if an older
-- environment already contains duplicates that first need the merge tool.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_clients_normalized_email_unique') then
    if not exists (
      select 1 from public.clients
      where nullif(trim(email), '') is not null
      group by lower(trim(email)) having count(*) > 1
    ) then
      execute 'create unique index idx_clients_normalized_email_unique
        on public.clients(lower(trim(email)))
        where nullif(trim(email), '''') is not null';
    else
      raise notice 'Skipped unique client email index until existing duplicates are merged.';
    end if;
  end if;
end $$;

create index if not exists idx_clients_normalized_phone
  on public.clients((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')))
  where nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '') is not null;

create table if not exists public.client_account_invites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  invited_by text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_account_invites_client
  on public.client_account_invites(client_id, created_at desc);
create index if not exists idx_client_account_invites_pending
  on public.client_account_invites(lower(email), expires_at desc)
  where accepted_at is null and revoked_at is null;

alter table public.client_account_invites enable row level security;

alter table public.client_deliveries
  add column if not exists manual_client_id uuid references public.clients(id) on delete set null;

alter table public.finance_projects
  add column if not exists manual_client_id uuid references public.clients(id) on delete set null;

create index if not exists idx_client_deliveries_manual_client
  on public.client_deliveries(manual_client_id, created_at desc)
  where manual_client_id is not null;
create index if not exists idx_finance_projects_manual_client
  on public.finance_projects(manual_client_id)
  where manual_client_id is not null;

alter table public.client_deliveries
  drop constraint if exists client_deliveries_status_check;
alter table public.client_deliveries
  add constraint client_deliveries_status_check
  check (status in (
    'draft', 'assigned', 'submitted', 'revision_requested',
    'awaiting_account', 'published', 'rejected'
  ));

comment on column public.clients.platform_user_id is
  'The authenticated CDS Space profile linked to this manual CRM client.';
comment on table public.client_account_invites is
  'Hashed, expiring invitations for manual CRM clients to create and link a CDS Space account.';
comment on column public.client_deliveries.manual_client_id is
  'The CRM recipient selected for this finished-work handover, including clients without an account.';
