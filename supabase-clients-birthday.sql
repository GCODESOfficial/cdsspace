-- ============================================
-- CDS Space: Add birthday to clients
-- ============================================
-- Lets the team capture client / brand-owner birthdays so we can
-- send greeting cards or remember relationships.
--
-- Run in Supabase SQL Editor.
-- ============================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birthday DATE;

-- Helpful for upcoming-birthday reports (matches birthdays by month/day,
-- ignoring the year). We avoid to_char(...) here because PostgreSQL only
-- allows IMMUTABLE expressions in index definitions.
CREATE INDEX IF NOT EXISTS idx_clients_birthday_mmdd
  ON public.clients (
    (EXTRACT(MONTH FROM birthday)),
    (EXTRACT(DAY FROM birthday))
  )
  WHERE birthday IS NOT NULL;
