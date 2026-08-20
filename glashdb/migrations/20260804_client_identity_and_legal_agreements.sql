-- CDS Space client identity, legal acceptance, and dashboard ownership.
-- Idempotent. The authenticated profile UUID is the source of truth for all
-- private client dashboard records. Email is retained only as display/contact
-- data and for backfilling older finance rows.

create extension if not exists "pgcrypto";

create table if not exists public.user_legal_agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_email text not null,
  user_full_name text,
  company_name text,
  terms_version integer not null default 0,
  terms_effective_date date,
  privacy_version integer not null default 0,
  privacy_effective_date date,
  agreement_text text not null,
  signed_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint user_legal_agreements_one_time unique (user_id)
);

create index if not exists idx_user_legal_agreements_signed_at
  on public.user_legal_agreements(signed_at desc);
create index if not exists idx_user_legal_agreements_email
  on public.user_legal_agreements(lower(user_email));

alter table public.user_legal_agreements enable row level security;
drop policy if exists "Users can read own legal agreement" on public.user_legal_agreements;
create policy "Users can read own legal agreement"
  on public.user_legal_agreements for select
  using (user_id = auth.uid());
drop policy if exists "Users can sign own legal agreement" on public.user_legal_agreements;
create policy "Users can sign own legal agreement"
  on public.user_legal_agreements for insert
  with check (user_id = auth.uid());

-- Invoices and projects were historically linked by client email/name. Keep
-- those fields, but make the authenticated profile UUID the ownership key.
alter table public.finance_invoices
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

alter table public.finance_projects
  add column if not exists client_email text,
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

alter table public.project_documents
  add column if not exists client_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists visibility text not null default 'internal';

update public.finance_invoices invoice
set user_id = profile.id
from public.profiles profile
where invoice.user_id is null
  and invoice.client_email is not null
  and lower(profile.email) = lower(invoice.client_email);

update public.finance_projects project
set user_id = invoice.user_id,
    client_email = coalesce(project.client_email, invoice.client_email)
from public.finance_invoices invoice
where project.id = invoice.project_id
  and project.user_id is null
  and invoice.user_id is not null;

update public.finance_projects project
set user_id = profile.id
from public.profiles profile
where project.user_id is null
  and project.client_email is not null
  and lower(profile.email) = lower(project.client_email);

update public.project_documents document
set client_user_id = project.user_id
from public.finance_projects project
where document.project_id = project.id
  and document.client_user_id is null
  and project.user_id is not null;

create index if not exists idx_finance_invoices_user_issue
  on public.finance_invoices(user_id, issue_date desc);
create index if not exists idx_finance_projects_user_created
  on public.finance_projects(user_id, created_at desc);
create index if not exists idx_project_documents_client_created
  on public.project_documents(client_user_id, created_at desc);

create or replace function public.assign_invoice_user_id()
returns trigger language plpgsql as $$
begin
  if new.client_email is not null and (
    new.user_id is null or tg_op = 'INSERT' or new.client_email is distinct from old.client_email
  ) then
    select id into new.user_id
    from public.profiles
    where lower(email) = lower(new.client_email)
    limit 1;
  end if;

  if new.project_id is not null and new.user_id is not null then
    update public.finance_projects
    set user_id = coalesce(user_id, new.user_id),
        client_email = coalesce(client_email, new.client_email),
        updated_at = now()
    where id = new.project_id;
  end if;

  return new;
end;
$$;

drop trigger if exists finance_invoices_assign_user_id on public.finance_invoices;
create trigger finance_invoices_assign_user_id
  before insert or update of client_email, project_id, user_id
  on public.finance_invoices
  for each row execute function public.assign_invoice_user_id();

create or replace function public.assign_project_user_id()
returns trigger language plpgsql as $$
begin
  if new.client_email is not null and (
    new.user_id is null or tg_op = 'INSERT' or new.client_email is distinct from old.client_email
  ) then
    select id into new.user_id
    from public.profiles
    where lower(email) = lower(new.client_email)
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_projects_assign_user_id on public.finance_projects;
create trigger finance_projects_assign_user_id
  before insert or update of client_email, user_id
  on public.finance_projects
  for each row execute function public.assign_project_user_id();

create or replace function public.assign_project_document_user_id()
returns trigger language plpgsql as $$
begin
  select user_id into new.client_user_id
  from public.finance_projects
  where id = new.project_id;
  return new;
end;
$$;

drop trigger if exists project_documents_assign_user_id on public.project_documents;
create trigger project_documents_assign_user_id
  before insert or update of project_id
  on public.project_documents
  for each row execute function public.assign_project_document_user_id();

-- Compatibility RLS for any direct authenticated database access. Application
-- API routes also enforce these same UUID boundaries server-side.
alter table public.finance_invoices enable row level security;
drop policy if exists allow_all_finance_invoices on public.finance_invoices;
drop policy if exists "Clients can read own invoices" on public.finance_invoices;
create policy "Clients can read own invoices"
  on public.finance_invoices for select
  using (user_id = auth.uid());

alter table public.finance_projects enable row level security;
drop policy if exists allow_all_finance_projects on public.finance_projects;
drop policy if exists "Clients can read own projects" on public.finance_projects;
create policy "Clients can read own projects"
  on public.finance_projects for select
  using (user_id = auth.uid());

alter table public.project_documents enable row level security;
drop policy if exists project_documents_all on public.project_documents;
drop policy if exists allow_all_project_documents on public.project_documents;
drop policy if exists "Clients can read own shared documents" on public.project_documents;
create policy "Clients can read own shared documents"
  on public.project_documents for select
  using (client_user_id = auth.uid() and visibility <> 'internal');

alter table public.merch_orders enable row level security;
drop policy if exists allow_all_merch_orders on public.merch_orders;
drop policy if exists "Clients can read own merch orders" on public.merch_orders;
create policy "Clients can read own merch orders"
  on public.merch_orders for select
  using (user_id = auth.uid());

alter table public.recurring_designs enable row level security;
drop policy if exists allow_all_recurring_designs on public.recurring_designs;
drop policy if exists "Clients can read own recurring designs" on public.recurring_designs;
create policy "Clients can read own recurring designs"
  on public.recurring_designs for select
  using (user_id = auth.uid());

grant select, insert on public.user_legal_agreements to authenticated;
grant select on public.finance_invoices, public.finance_projects, public.project_documents to authenticated;
