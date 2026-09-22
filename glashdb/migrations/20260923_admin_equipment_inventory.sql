create extension if not exists pgcrypto;

create table if not exists public.admin_equipment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_equipment_types_name_length check (char_length(trim(name)) between 2 and 80)
);

create unique index if not exists admin_equipment_types_name_key
  on public.admin_equipment_types (lower(trim(name)));

create table if not exists public.admin_equipment (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null,
  name text not null,
  equipment_type_id uuid not null references public.admin_equipment_types(id) on delete restrict,
  serial_number text,
  manufacturer text,
  model text,
  condition text not null default 'good' check (condition in ('new','good','fair','needs_repair','retired')),
  status text not null default 'available' check (status in ('available','assigned','maintenance','retired','lost')),
  location text,
  purchase_date date,
  purchase_cost numeric(14,2),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  warranty_expires_at date,
  notes text,
  password_ciphertext text,
  password_iv text,
  password_tag text,
  receipt_storage_path text,
  receipt_file_name text,
  receipt_content_type text,
  receipt_size_bytes bigint,
  assigned_team_member_id uuid references public.team_members(id) on delete set null,
  assigned_at timestamptz,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint admin_equipment_name_length check (char_length(trim(name)) between 2 and 140),
  constraint admin_equipment_asset_tag_length check (char_length(trim(asset_tag)) between 2 and 60),
  constraint admin_equipment_assignment_state check (
    (status = 'assigned' and assigned_team_member_id is not null and assigned_at is not null)
    or status <> 'assigned'
  )
);

create unique index if not exists admin_equipment_asset_tag_key
  on public.admin_equipment (lower(trim(asset_tag))) where deleted_at is null;
create unique index if not exists admin_equipment_serial_number_key
  on public.admin_equipment (lower(trim(serial_number)))
  where deleted_at is null and serial_number is not null and trim(serial_number) <> '';
create index if not exists admin_equipment_assignee_idx
  on public.admin_equipment (assigned_team_member_id) where deleted_at is null;
create index if not exists admin_equipment_type_idx
  on public.admin_equipment (equipment_type_id) where deleted_at is null;

create table if not exists public.admin_equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.admin_equipment(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete restrict,
  assigned_at timestamptz not null,
  returned_at timestamptz,
  assignment_note text,
  assigned_by text not null,
  returned_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_equipment_one_open_assignment
  on public.admin_equipment_assignments (equipment_id) where returned_at is null;

create table if not exists public.admin_equipment_drafts (
  admin_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_equipment_audit (
  id bigint generated always as identity primary key,
  equipment_id uuid references public.admin_equipment(id) on delete set null,
  actor_key text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
declare
  table_name text;
  role_name text;
begin
  foreach table_name in array array[
    'admin_equipment_types', 'admin_equipment', 'admin_equipment_assignments',
    'admin_equipment_drafts', 'admin_equipment_audit'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on table public.%I from %I', table_name, role_name);
      end if;
    end loop;
  end loop;
end
$$;

insert into storage.buckets (id, name, public)
values ('equipment-private', 'equipment-private', false)
on conflict (id) do update set public = false;

