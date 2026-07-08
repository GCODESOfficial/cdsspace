-- ============================================
-- CDS Space: Finance quotations
--
-- Quotations are rough project estimates. They intentionally live outside
-- finance_invoices so they are not counted as revenue, receivables, tax, or
-- audit book entries until explicitly converted to an invoice.
-- Idempotent.
-- ============================================

create extension if not exists "pgcrypto";

create table if not exists public.finance_quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text unique not null,
  project_id uuid references public.finance_projects(id) on delete set null,
  milestone_id uuid references public.finance_milestones(id) on delete set null,
  converted_invoice_id uuid references public.finance_invoices(id) on delete set null,
  project_name text not null,
  client_name text not null,
  client_email text,
  client_address text,
  currency text not null default 'NGN',
  subtotal numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','accepted','converted','cancelled')),
  scope text not null default 'custom' check (scope in ('custom','project','milestone','monthly')),
  period_month text,
  issue_date date not null default current_date,
  valid_until date,
  notes text,
  estimate_note text not null default 'This quotation is a rough estimate for the project delivery. Final scope, timeline, and cost may change after confirmation.',
  revisions_note text not null default 'Designs are subject to Free 2 Revisions',
  working_hours text not null default '9am-5:30pm Monday-Friday UTC+1',
  delivery_period text,
  public_token text unique not null,
  converted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_quotations_project
  on public.finance_quotations(project_id);

create index if not exists idx_finance_quotations_created
  on public.finance_quotations(created_at desc);

create index if not exists idx_finance_quotations_token
  on public.finance_quotations(public_token);

create table if not exists public.finance_quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.finance_quotations(id) on delete cascade,
  name text not null,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null,
  total numeric(14,2) not null,
  position int not null default 0
);

create index if not exists idx_finance_quotation_items_quotation
  on public.finance_quotation_items(quotation_id);

create table if not exists public.finance_quotation_samples (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.finance_quotations(id) on delete cascade,
  kind text not null default 'link' check (kind in ('image','link')),
  url text not null,
  label text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_quotation_samples_quotation
  on public.finance_quotation_samples(quotation_id);

alter table public.finance_quotations enable row level security;
alter table public.finance_quotation_items enable row level security;
alter table public.finance_quotation_samples enable row level security;

drop policy if exists allow_all_finance_quotations on public.finance_quotations;
create policy allow_all_finance_quotations
  on public.finance_quotations
  for all
  using (true)
  with check (true);

drop policy if exists allow_all_finance_quotation_items on public.finance_quotation_items;
create policy allow_all_finance_quotation_items
  on public.finance_quotation_items
  for all
  using (true)
  with check (true);

drop policy if exists allow_all_finance_quotation_samples on public.finance_quotation_samples;
create policy allow_all_finance_quotation_samples
  on public.finance_quotation_samples
  for all
  using (true)
  with check (true);

grant select, insert, update, delete on public.finance_quotations to anon, authenticated, service_role;
grant select, insert, update, delete on public.finance_quotation_items to anon, authenticated, service_role;
grant select, insert, update, delete on public.finance_quotation_samples to anon, authenticated, service_role;

comment on table public.finance_quotations is
  'Rough project estimates. Not part of financial books until converted into finance_invoices.';

-- Make the new section visible to the starter finance roles without replacing
-- custom role permissions. Guarded so the migration can run safely even if a
-- smaller environment has not created admin_roles yet.
do $$
begin
  if to_regclass('public.admin_roles') is not null then
    update public.admin_roles
    set permissions = (
      select array_agg(distinct p)
      from unnest(permissions || array[
        'finance_quotations.view',
        'finance_quotations.create',
        'finance_quotations.edit',
        'finance_quotations.delete',
        'finance_quotations.convert',
        'finance_quotations.export'
      ]) as p
    )
    where name = 'Finance Manager';

    update public.admin_roles
    set permissions = (
      select array_agg(distinct p)
      from unnest(permissions || array['finance_quotations.view']) as p
    )
    where name = 'Viewer';
  end if;
end $$;
