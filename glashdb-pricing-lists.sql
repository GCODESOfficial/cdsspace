-- ============================================
-- CDS Space: Pricing Lists (client-facing pricelists)
-- Run this in the GlashDB SQL editor (manual migration - no runner).
--
-- One row = one shareable pricelist (e.g. "Brand Identity Pricing").
-- The full structured document (packages, add-ons, terms, per-currency
-- amounts) is stored in `data` as JSONB. Uploading a PDF per currency
-- merges its amounts into the same row.
-- ============================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.pricing_lists (
  id          TEXT PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  published   BOOLEAN NOT NULL DEFAULT false,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_lists_published_idx ON public.pricing_lists (published);

-- 2. RLS
ALTER TABLE public.pricing_lists ENABLE ROW LEVEL SECURITY;

-- 3. Public can read only PUBLISHED lists (client-facing pages).
DROP POLICY IF EXISTS "Public read published pricing_lists" ON public.pricing_lists;
CREATE POLICY "Public read published pricing_lists"
  ON public.pricing_lists FOR SELECT USING (published = true);

-- 4. Service role / admin has full access (writes go through the admin API
--    using the service-role key, which bypasses RLS).
DROP POLICY IF EXISTS "Service role full access pricing_lists" ON public.pricing_lists;
CREATE POLICY "Service role full access pricing_lists"
  ON public.pricing_lists FOR ALL USING (true) WITH CHECK (true);
