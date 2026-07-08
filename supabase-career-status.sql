-- ============================================
-- CDS Space: Career - application status tracking
-- Run this in Supabase SQL Editor AFTER supabase-hrm.sql
-- ============================================

-- 1. Add tracking_code + admin_note to role_applications
ALTER TABLE public.role_applications
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS role_applications_tracking_code_idx
  ON public.role_applications (tracking_code)
  WHERE tracking_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS role_applications_email_idx
  ON public.role_applications (lower(email));

-- 2. Auto-stamp status_updated_at when status changes
CREATE OR REPLACE FUNCTION public.role_applications_stamp_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_role_applications_stamp_status ON public.role_applications;
CREATE TRIGGER trg_role_applications_stamp_status
  BEFORE UPDATE ON public.role_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.role_applications_stamp_status();

-- 3. Backfill tracking codes for rows that don't have one
UPDATE public.role_applications
SET tracking_code = 'CDS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE tracking_code IS NULL;
