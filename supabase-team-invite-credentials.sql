-- ============================================
-- CDS Space: Team member invite credentials
-- ============================================
-- Adds a column that temporarily stores the admin-configured password
-- so an invite link can pre-fill the login form (mirrors the
-- sub_admin_invites flow). The column is cleared the moment the
-- invite token is redeemed.
--
-- Run this in Supabase SQL Editor after supabase-team-portal.sql.
-- ============================================

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS invite_temp_password TEXT;

-- The password is only readable once: whenever invite_token is set to NULL
-- the trigger blanks the temp password too. That guarantees the value
-- disappears the moment the invite is redeemed or revoked.
CREATE OR REPLACE FUNCTION public.team_members_clear_temp_password()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.invite_token IS NOT NULL
     AND NEW.invite_token IS NULL
     AND NEW.invite_temp_password IS NOT NULL THEN
    NEW.invite_temp_password := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_members_clear_temp_password ON public.team_members;
CREATE TRIGGER trg_team_members_clear_temp_password
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.team_members_clear_temp_password();
