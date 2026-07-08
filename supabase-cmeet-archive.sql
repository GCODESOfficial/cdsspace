-- ============================================
-- CDS Space: cMeet - soft-archive support
-- ============================================
-- Adds archived_at to team_meetings. The meetings list filters out
-- archived rows; bulk actions can move rows in/out of the archive.
-- Run in Supabase SQL Editor.
-- ============================================

ALTER TABLE public.team_meetings
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_team_meetings_archived_at
  ON public.team_meetings (archived_at)
  WHERE archived_at IS NOT NULL;
