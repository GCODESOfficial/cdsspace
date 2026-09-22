-- Client cDrive, durable client call invitations, API access governance and
-- lightweight client-presence telemetry.

create extension if not exists "pgcrypto";

create table if not exists public.cmeet_client_invitations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.team_meetings(id) on delete cascade,
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by text,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  dismissed_at timestamptz,
  unique (meeting_id, client_user_id)
);

create index if not exists idx_cmeet_client_invitations_ringing
  on public.cmeet_client_invitations(client_user_id, invited_at desc)
  where joined_at is null and dismissed_at is null;

create table if not exists public.cmeet_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references public.team_meetings(id) on delete cascade,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  joined_by text
);

create table if not exists public.client_presence (
  client_user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  last_path text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_presence_last_seen
  on public.client_presence(last_seen_at desc);

create table if not exists public.client_drives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  project_id uuid references public.finance_projects(id) on delete set null,
  created_by_kind text not null check (created_by_kind in ('admin', 'client')),
  created_by_id text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_drive_members (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references public.client_drives(id) on delete cascade,
  client_user_id uuid not null references public.profiles(id) on delete cascade,
  access_level text not null default 'view' check (access_level in ('view', 'edit')),
  shared_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drive_id, client_user_id)
);

create table if not exists public.client_drive_folders (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references public.client_drives(id) on delete cascade,
  parent_id uuid references public.client_drive_folders(id) on delete cascade,
  name text not null,
  created_by_kind text not null check (created_by_kind in ('admin', 'client')),
  created_by_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (drive_id, parent_id, name)
);

create table if not exists public.client_drive_files (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references public.client_drives(id) on delete cascade,
  folder_id uuid references public.client_drive_folders(id) on delete cascade,
  file_name text not null,
  storage_bucket text not null default 'client-drives',
  storage_path text not null unique,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  uploaded_by_kind text not null check (uploaded_by_kind in ('admin', 'client')),
  uploaded_by_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_drive_members_client
  on public.client_drive_members(client_user_id, updated_at desc);
create index if not exists idx_client_drive_folders_drive
  on public.client_drive_folders(drive_id, parent_id, name);
create index if not exists idx_client_drive_files_drive
  on public.client_drive_files(drive_id, folder_id, created_at desc);

create table if not exists public.cmeet_api_applications (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid references public.profiles(id) on delete set null,
  applicant_name text not null,
  company_name text,
  email text not null,
  website text,
  use_case text not null,
  expected_monthly_calls integer not null default 0 check (expected_monthly_calls >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cmeet_api_keys (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.cmeet_api_applications(id) on delete set null,
  client_user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  key_prefix text not null unique,
  secret_hash text not null unique,
  scopes text[] not null default array['meetings:create']::text[],
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 10000),
  status text not null default 'active' check (status in ('active', 'revoked')),
  issued_by text not null,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.team_meetings
  add column if not exists api_key_id uuid references public.cmeet_api_keys(id) on delete set null;
create index if not exists idx_team_meetings_api_key
  on public.team_meetings(api_key_id, created_at desc)
  where api_key_id is not null;

create index if not exists idx_cmeet_api_applications_status
  on public.cmeet_api_applications(status, created_at desc);
create index if not exists idx_cmeet_api_keys_client
  on public.cmeet_api_keys(client_user_id, created_at desc);

create table if not exists public.cmeet_api_request_log (
  id bigserial primary key,
  api_key_id uuid not null references public.cmeet_api_keys(id) on delete cascade,
  endpoint text not null,
  response_status integer not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cmeet_api_request_log_rate
  on public.cmeet_api_request_log(api_key_id, created_at desc);

alter table public.cmeet_client_invitations enable row level security;
alter table public.cmeet_staff_invitations enable row level security;
alter table public.client_presence enable row level security;
alter table public.client_drives enable row level security;
alter table public.client_drive_members enable row level security;
alter table public.client_drive_folders enable row level security;
alter table public.client_drive_files enable row level security;
alter table public.cmeet_api_applications enable row level security;
alter table public.cmeet_api_keys enable row level security;
alter table public.cmeet_api_request_log enable row level security;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('client-drives', 'client-drives', false, 104857600, null)
    on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        updated_at = now();
  end if;
end $$;
