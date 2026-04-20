-- ============================================
-- CDS Space: Sub-Admins Table
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Create the sub_admins table
CREATE TABLE IF NOT EXISTS public.sub_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Enable Row Level Security
ALTER TABLE public.sub_admins ENABLE ROW LEVEL SECURITY;

-- 3. Allow service_role full access (API routes only)
CREATE POLICY "Allow service_role full access on sub_admins"
  ON public.sub_admins
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Allow anon SELECT for login verification
CREATE POLICY "Allow anon read on sub_admins"
  ON public.sub_admins
  FOR SELECT
  USING (true);
