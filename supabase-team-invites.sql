-- ============================================
-- CDS Space: Self-serve team invites + departments
-- Run this in Supabase SQL Editor after supabase-team-portal.sql.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Departments catalog (each has its own chat thread)
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  slug TEXT,
  color TEXT,
  thread_id UUID REFERENCES public.team_chat_threads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_departments" ON public.departments;
CREATE POLICY "allow_all_departments" ON public.departments
  FOR ALL USING (true) WITH CHECK (true);

-- Backfill for older deployments that created this table before these columns existed
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.team_chat_threads(id) ON DELETE SET NULL;

-- 2. team_members: FK to departments (legacy TEXT column kept for compat)
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_department_id
  ON public.team_members(department_id);

-- 3. Invite tokens
CREATE TABLE IF NOT EXISTS public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  -- Optional hints pre-set by the admin; invitee may override.
  suggested_role_title TEXT,
  suggested_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  is_sub_admin BOOLEAN NOT NULL DEFAULT false,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  redeemed_at TIMESTAMPTZ,
  redeemed_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invites_token ON public.team_invites (token);
CREATE INDEX IF NOT EXISTS idx_team_invites_open
  ON public.team_invites (redeemed_at) WHERE redeemed_at IS NULL;

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_team_invites" ON public.team_invites;
CREATE POLICY "allow_all_team_invites" ON public.team_invites
  FOR ALL USING (true) WITH CHECK (true);
