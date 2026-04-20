-- ============================================
-- CDS Space: Plan Pricing Table
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Create plan_pricing table
CREATE TABLE IF NOT EXISTS public.plan_pricing (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan TEXT NOT NULL,
  industry TEXT NOT NULL,
  price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_ngn NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_rwf NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(plan, industry)
);

-- 2. Enable RLS
ALTER TABLE public.plan_pricing ENABLE ROW LEVEL SECURITY;

-- 3. Public read (for subscription page)
DROP POLICY IF EXISTS "Allow public read on plan_pricing" ON public.plan_pricing;
CREATE POLICY "Allow public read on plan_pricing"
  ON public.plan_pricing FOR SELECT USING (true);

-- 4. Authenticated write (admin)
DROP POLICY IF EXISTS "Allow authenticated write on plan_pricing" ON public.plan_pricing;
CREATE POLICY "Allow authenticated write on plan_pricing"
  ON public.plan_pricing FOR ALL USING (true) WITH CHECK (true);
