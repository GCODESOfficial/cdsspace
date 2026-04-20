-- ============================================
-- CDS Space: Applications Archive Support
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Add archive columns safely
DO $$
BEGIN
  ALTER TABLE public.applications
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
EXCEPTION
  WHEN undefined_table THEN
    RAISE EXCEPTION 'public.applications table does not exist. Create the applications table first.';
END $$;

-- 2. Backfill older rows that may have null archive flags
UPDATE public.applications
SET is_archived = false
WHERE is_archived IS NULL;

-- 3. Helpful indexes for admin filters/search
CREATE INDEX IF NOT EXISTS idx_applications_is_archived_created_at
  ON public.applications (is_archived, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_archived_at
  ON public.applications (archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_role
  ON public.applications (role);

CREATE INDEX IF NOT EXISTS idx_applications_email
  ON public.applications (email);

CREATE INDEX IF NOT EXISTS idx_applications_legal_name
  ON public.applications (legal_name);
