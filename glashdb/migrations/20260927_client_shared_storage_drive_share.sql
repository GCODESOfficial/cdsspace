-- Stable public cDrive sharing and one private client-storage allowance shared
-- by cDrive and Create Studio.

create extension if not exists pgcrypto;

alter table public.client_drives
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists idx_client_drives_public_token
  on public.client_drives(public_token);

alter table public.client_drive_files
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists idx_client_drive_files_public_token
  on public.client_drive_files(public_token);

alter table public.create_letterheads
  add column if not exists first_page_size_bytes bigint not null default 0 check (first_page_size_bytes >= 0),
  add column if not exists second_page_size_bytes bigint not null default 0 check (second_page_size_bytes >= 0),
  add column if not exists signature_size_bytes bigint not null default 0 check (signature_size_bytes >= 0);

create table if not exists public.client_storage_reservations (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  bytes bigint not null check (bytes > 0),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists idx_client_storage_reservations_active
  on public.client_storage_reservations(client_user_id, expires_at);

create table if not exists public.client_storage_requests (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  note text
);

create unique index if not exists idx_client_storage_requests_one_pending
  on public.client_storage_requests(client_user_id)
  where status = 'pending';

create index if not exists idx_client_storage_requests_admin_queue
  on public.client_storage_requests(status, requested_at desc);

alter table public.client_storage_reservations enable row level security;
alter table public.client_storage_requests enable row level security;
