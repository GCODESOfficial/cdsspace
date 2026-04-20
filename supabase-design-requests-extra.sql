-- ============================================
-- CDS Space: design_requests extra columns
-- Adds category + asset_paths to existing table
-- Run in Supabase SQL Editor
-- ============================================

ALTER TABLE public.design_requests
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS asset_paths TEXT[];

CREATE INDEX IF NOT EXISTS idx_design_requests_category ON public.design_requests(category);
