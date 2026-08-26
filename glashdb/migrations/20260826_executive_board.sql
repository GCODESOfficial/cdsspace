begin;

-- Executive Board: budgets, targets, revenue models with their execution
-- plans, and a document vault whose folders and files can each carry their own
-- password so a share link is useless without it.

create table if not exists public.executive_budgets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'operations',
  period_label text not null default '',
  period_start date,
  period_end date,
  currency text not null default 'USD',
  planned_amount numeric(16,2) not null default 0,
  actual_amount numeric(16,2) not null default 0,
  owner text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed')),
  notes text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executive_budgets_status_idx
  on public.executive_budgets (status, period_start desc nulls last);

create table if not exists public.executive_revenue_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  summary text,
  pricing_basis text,
  status text not null default 'exploring'
    check (status in ('exploring', 'piloting', 'active', 'paused', 'retired')),
  currency text not null default 'USD',
  target_annual_value numeric(16,2) not null default 0,
  owner text,
  position integer not null default 0,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executive_revenue_models_status_idx
  on public.executive_revenue_models (status, position, created_at);

-- The step-by-step execution plan for one revenue model.
create table if not exists public.executive_revenue_steps (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.executive_revenue_models(id) on delete cascade,
  position integer not null default 0,
  title text not null,
  detail text,
  owner text,
  due_on date,
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'blocked', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executive_revenue_steps_model_idx
  on public.executive_revenue_steps (model_id, position);

create table if not exists public.executive_targets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  metric text not null default '',
  unit text not null default '',
  target_value numeric(16,2) not null default 0,
  current_value numeric(16,2) not null default 0,
  due_on date,
  owner text,
  model_id uuid references public.executive_revenue_models(id) on delete set null,
  status text not null default 'on_track'
    check (status in ('on_track', 'at_risk', 'off_track', 'achieved')),
  notes text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executive_targets_status_idx
  on public.executive_targets (status, due_on nulls last);

-- Vault folders form a tree. A folder password covers everything inside it
-- that does not set its own.
create table if not exists public.executive_vault_folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.executive_vault_folders(id) on delete cascade,
  name text not null,
  description text,
  password_hash text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executive_vault_folders_parent_idx
  on public.executive_vault_folders (parent_id, name);

create table if not exists public.executive_vault_files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.executive_vault_folders(id) on delete set null,
  title text not null,
  description text,
  kind text not null default 'attachment'
    check (kind in ('legal', 'budget', 'target', 'revenue', 'attachment', 'other')),
  storage_path text not null,
  file_name text not null,
  file_mime text,
  file_size_bytes bigint not null default 0,
  password_hash text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executive_vault_files_folder_idx
  on public.executive_vault_files (folder_id, created_at desc);

-- A share is the only way a vault item leaves the building. The token alone
-- opens nothing when the item (or its folder) carries a password.
create table if not exists public.executive_vault_shares (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  file_id uuid references public.executive_vault_files(id) on delete cascade,
  folder_id uuid references public.executive_vault_folders(id) on delete cascade,
  password_hash text,
  recipient_email text,
  note text,
  expires_at timestamptz,
  max_downloads integer,
  download_count integer not null default 0,
  last_opened_at timestamptz,
  revoked_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  constraint executive_vault_shares_target_check
    check ((file_id is not null) <> (folder_id is not null))
);

create index if not exists executive_vault_shares_token_idx
  on public.executive_vault_shares (token);
create index if not exists executive_vault_shares_file_idx
  on public.executive_vault_shares (file_id, created_at desc);

alter table public.executive_budgets enable row level security;
alter table public.executive_revenue_models enable row level security;
alter table public.executive_revenue_steps enable row level security;
alter table public.executive_targets enable row level security;
alter table public.executive_vault_folders enable row level security;
alter table public.executive_vault_files enable row level security;
alter table public.executive_vault_shares enable row level security;

-- Private bucket: vault objects are only ever streamed through our own routes,
-- which is what lets a password gate them.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('executive-board', 'executive-board', false, 52428800, null)
    on conflict (id) do nothing;
  end if;
end $$;

comment on table public.executive_vault_shares is
  'Outbound share links for Executive Board vault items. Password, expiry, and download cap are enforced when the link is opened.';
comment on column public.executive_vault_folders.password_hash is
  'Optional bcrypt hash. Covers every file inside the folder that has no password of its own.';

commit;
