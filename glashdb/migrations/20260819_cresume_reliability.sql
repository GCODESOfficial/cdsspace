-- Ensure cResume exists in GlashDB deployments that did not run the older
-- Supabase-only team portal schema.

create table if not exists public.team_resumes (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  headline text,
  about text,
  skills text[] not null default '{}',
  past_roles jsonb not null default '[]'::jsonb,
  projects jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  share_token text unique,
  avatar_url text,
  location text,
  website text,
  email_public text,
  socials jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.team_resumes
  add column if not exists certifications jsonb not null default '[]'::jsonb,
  add column if not exists share_token text,
  add column if not exists avatar_url text,
  add column if not exists location text,
  add column if not exists website text,
  add column if not exists email_public text,
  add column if not exists socials jsonb not null default '{}'::jsonb,
  add column if not exists is_public boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_team_resumes_share_token
  on public.team_resumes (share_token)
  where share_token is not null;
