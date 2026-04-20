-- ============================================================
-- CDS Space Finance Module — full schema (all modules)
-- Run once in Supabase SQL editor.
-- Safe to re-run: uses IF NOT EXISTS where possible.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Projects & Milestones ----------
create table if not exists finance_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null,
  currency text not null check (currency in ('NGN','RWF','USD')),
  duration_start date,
  duration_end date,
  status text not null default 'active' check (status in ('active','completed','paused','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references finance_projects(id) on delete cascade,
  description text not null,
  budget numeric(14,2) not null default 0,
  assigned_to text,
  duration_start date,
  duration_end date,
  payment_basis text not null default 'milestone' check (payment_basis in ('milestone','monthly')),
  monthly_amount numeric(14,2),
  paid_amount numeric(14,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','paid')),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_finance_milestones_project on finance_milestones(project_id);

-- ---------- Price list ----------
create table if not exists finance_price_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  unit_price numeric(14,2) not null,
  currency text not null default 'NGN',
  image_url text,
  category text,
  created_at timestamptz not null default now()
);
create index if not exists idx_finance_price_items_name on finance_price_items(lower(name));

-- ---------- Invoices ----------
create table if not exists finance_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  project_id uuid references finance_projects(id) on delete set null,
  milestone_id uuid references finance_milestones(id) on delete set null,
  client_name text not null,
  client_email text,
  client_address text,
  currency text not null default 'NGN',
  subtotal numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','paid','overdue','cancelled')),
  scope text not null default 'custom' check (scope in ('custom','project','milestone','monthly')),
  period_month text,
  issue_date date not null default current_date,
  due_date date,
  notes text,
  public_token text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_finance_invoices_project on finance_invoices(project_id);

create table if not exists finance_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references finance_invoices(id) on delete cascade,
  name text not null,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null,
  total numeric(14,2) not null,
  position int not null default 0
);
create index if not exists idx_finance_invoice_items_invoice on finance_invoice_items(invoice_id);

-- ---------- Subscriptions ----------
create table if not exists finance_subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references finance_projects(id) on delete cascade,
  name text not null,
  category text,
  amount numeric(14,2) not null,
  currency text not null default 'NGN',
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','quarterly','yearly')),
  next_due_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Contractors ----------
create table if not exists finance_contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_niche text,
  phone text,
  whatsapp text,
  email text,
  bank_name text,
  account_name text,
  account_number text,
  bank_code text,
  office_location text,
  start_date date,
  notes text,
  source text not null default 'admin' check (source in ('admin','public')),
  created_at timestamptz not null default now()
);

create table if not exists finance_contractor_invites (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  used boolean not null default false,
  contractor_id uuid references finance_contractors(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists finance_contractor_assignments (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references finance_contractors(id) on delete cascade,
  project_id uuid not null references finance_projects(id) on delete cascade,
  milestone_id uuid references finance_milestones(id) on delete set null,
  agreed_amount numeric(14,2) not null,
  currency text not null default 'NGN',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists finance_contractor_payments (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references finance_contractors(id) on delete cascade,
  project_id uuid references finance_projects(id) on delete set null,
  amount numeric(14,2) not null,
  currency text not null default 'NGN',
  paid_on date not null,
  payment_ref text,
  proof_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Expenditures ----------
create table if not exists finance_expenditures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  amount numeric(14,2) not null,
  currency text not null default 'NGN',
  spent_on date not null default current_date,
  recurring boolean not null default false,
  recurrence_cycle text check (recurrence_cycle in ('monthly','quarterly','yearly')),
  next_due_date date,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Payroll ----------
create table if not exists finance_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  email text,
  phone text,
  bank_name text,
  bank_code text,
  account_number text,
  account_name text,
  base_salary numeric(14,2),
  currency text not null default 'NGN',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists finance_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  period text not null,
  status text not null default 'draft' check (status in ('draft','processed','paid')),
  total numeric(14,2) not null default 0,
  currency text not null default 'NGN',
  created_at timestamptz not null default now()
);

create table if not exists finance_payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references finance_payroll_runs(id) on delete cascade,
  employee_id uuid references finance_employees(id) on delete set null,
  account_number text not null,
  amount numeric(14,2) not null,
  bank_code text not null,
  narration text not null
);
create index if not exists idx_finance_payroll_items_run on finance_payroll_items(payroll_run_id);

-- ---------- Row Level Security ----------
-- Enable RLS on every finance_* table with a permissive policy,
-- matching the project-wide pattern (app uses anon client for admin
-- ops; tighten per-table later if needed).
do $$
declare
  t text;
  finance_tables text[] := array[
    'finance_projects',
    'finance_milestones',
    'finance_price_items',
    'finance_invoices',
    'finance_invoice_items',
    'finance_subscriptions',
    'finance_contractors',
    'finance_contractor_invites',
    'finance_contractor_assignments',
    'finance_contractor_payments',
    'finance_expenditures',
    'finance_employees',
    'finance_payroll_runs',
    'finance_payroll_items'
  ];
begin
  foreach t in array finance_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'allow_all_' || t, t);
    execute format(
      'create policy %I on public.%I for all using (true) with check (true)',
      'allow_all_' || t, t
    );
  end loop;
end $$;
