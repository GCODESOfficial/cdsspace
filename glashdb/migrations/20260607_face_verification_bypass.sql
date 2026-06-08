-- CDS Space Face Verification + Timebook Geofence Bypass.
--
-- Stores compact numeric face descriptors, liveness/login events,
-- short-lived face challenge tokens, and one-time super-admin geofence
-- bypass codes. Raw face images are not stored.

create extension if not exists "pgcrypto";

create table if not exists public.team_face_profiles (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  descriptor jsonb not null,
  descriptor_version text not null default 'center-gray-32-v1',
  status text not null default 'active' check (status in ('active','disabled','reset_required')),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz,
  enrollment_attempts integer not null default 0,
  verification_failures integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.team_face_challenges (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  purpose text not null check (purpose in ('enrollment','verification','login')),
  challenge_actions text[] not null default '{}',
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  result text not null default 'pending' check (result in ('pending','passed','failed','expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.team_face_verification_events (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  challenge_id uuid references public.team_face_challenges(id) on delete set null,
  event_type text not null check (event_type in ('enrollment','verification','login')),
  success boolean not null default false,
  liveness_score numeric(8,5),
  match_score numeric(8,5),
  failure_reason text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.team_geofence_bypass_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  status text not null default 'active' check (status in ('active','used','revoked','expired')),
  generated_by text,
  generated_by_name text,
  assigned_team_member_id uuid references public.team_members(id) on delete set null,
  reason text,
  expires_at timestamptz not null,
  used_by uuid references public.team_members(id) on delete set null,
  used_entry_id uuid references public.team_time_entries(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.team_time_entries
  add column if not exists geofence_bypass_code_id uuid references public.team_geofence_bypass_codes(id) on delete set null,
  add column if not exists geofence_bypass_reason text,
  add column if not exists clock_in_face_verified boolean not null default false,
  add column if not exists clock_in_face_event_id uuid references public.team_face_verification_events(id) on delete set null;

create index if not exists idx_team_face_challenges_member_created
  on public.team_face_challenges (team_member_id, created_at desc);
create index if not exists idx_team_face_challenges_token
  on public.team_face_challenges (token_hash);
create index if not exists idx_team_face_events_member_created
  on public.team_face_verification_events (team_member_id, created_at desc);
create index if not exists idx_geofence_bypass_codes_status_expiry
  on public.team_geofence_bypass_codes (status, expires_at);
create index if not exists idx_geofence_bypass_codes_assigned
  on public.team_geofence_bypass_codes (assigned_team_member_id, created_at desc);

create or replace function public.touch_team_face_profile_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_team_face_profiles_touch on public.team_face_profiles;
create trigger trg_team_face_profiles_touch
  before update on public.team_face_profiles
  for each row execute function public.touch_team_face_profile_updated_at();

do $$
declare
  t text;
  face_tables text[] := array[
    'team_face_profiles',
    'team_face_challenges',
    'team_face_verification_events',
    'team_geofence_bypass_codes'
  ];
begin
  foreach t in array face_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'allow_all_' || t, t);
    execute format(
      'create policy %I on public.%I for all using (true) with check (true)',
      'allow_all_' || t,
      t
    );
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

comment on table public.team_face_profiles is
  'Face verification descriptors for team login. Stores compact numeric descriptors only, not raw face images.';
comment on table public.team_geofence_bypass_codes is
  'One-time, short-lived super-admin codes that allow clock-in when GPS geofence verification cannot be completed.';
