create extension if not exists pgcrypto;

create table if not exists public.team_device_sessions (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  session_token text not null unique,
  device_type text not null check (device_type in ('desktop', 'mobile')),
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists team_device_sessions_member_idx
  on public.team_device_sessions(team_member_id, device_type, expires_at desc);

create index if not exists team_device_sessions_token_active_idx
  on public.team_device_sessions(session_token)
  where revoked_at is null;

create unique index if not exists team_device_sessions_one_active_type_idx
  on public.team_device_sessions(team_member_id, device_type)
  where revoked_at is null;

alter table public.team_face_challenges
  add column if not exists handoff_code text;

create unique index if not exists team_face_challenges_handoff_code_idx
  on public.team_face_challenges(handoff_code)
  where handoff_code is not null;
