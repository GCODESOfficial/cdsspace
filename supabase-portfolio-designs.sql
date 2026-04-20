-- ============================================
-- CDS Space: Portfolio Designs Table
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Create portfolio_designs table
CREATE TABLE IF NOT EXISTS public.portfolio_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.portfolio_designs ENABLE ROW LEVEL SECURITY;

-- 3. Public read access (for subscription sidebar)
DROP POLICY IF EXISTS "Allow public read on portfolio_designs" ON public.portfolio_designs;
CREATE POLICY "Allow public read on portfolio_designs"
  ON public.portfolio_designs FOR SELECT USING (true);

-- 4. Service role full access (admin API)
DROP POLICY IF EXISTS "Service role full access on portfolio_designs" ON public.portfolio_designs;
CREATE POLICY "Service role full access on portfolio_designs"
  ON public.portfolio_designs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 5. Authenticated full access (admin uploads)
DROP POLICY IF EXISTS "Authenticated full access on portfolio_designs" ON public.portfolio_designs;
CREATE POLICY "Authenticated full access on portfolio_designs"
  ON public.portfolio_designs FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Create storage bucket for portfolio designs
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio-designs', 'portfolio-designs', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage policies
DROP POLICY IF EXISTS "Allow public read on portfolio-designs bucket" ON storage.objects;
CREATE POLICY "Allow public read on portfolio-designs bucket"
  ON storage.objects FOR SELECT USING (bucket_id = 'portfolio-designs');

DROP POLICY IF EXISTS "Allow authenticated upload to portfolio-designs" ON storage.objects;
CREATE POLICY "Allow authenticated upload to portfolio-designs"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'portfolio-designs');

DROP POLICY IF EXISTS "Allow authenticated delete from portfolio-designs" ON storage.objects;
CREATE POLICY "Allow authenticated delete from portfolio-designs"
  ON storage.objects FOR DELETE USING (bucket_id = 'portfolio-designs');
