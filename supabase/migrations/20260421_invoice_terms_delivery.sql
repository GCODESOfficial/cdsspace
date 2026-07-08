-- ============================================
-- CDS Space: Invoice - payment terms + delivery speed
-- Idempotent.
-- ============================================

ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS payment_terms TEXT NOT NULL DEFAULT '100% Upfront Payment. Payment is not Refundable',
  ADD COLUMN IF NOT EXISTS revisions_note TEXT NOT NULL DEFAULT 'Designs are subject to Free 2 Revisions',
  ADD COLUMN IF NOT EXISTS working_hours TEXT NOT NULL DEFAULT '9am–5:30pm Monday–Friday  UTC+1',
  ADD COLUMN IF NOT EXISTS delivery_speed TEXT NOT NULL DEFAULT 'standard' CHECK (delivery_speed IN ('standard','express','super_express','flash')),
  ADD COLUMN IF NOT EXISTS delivery_period TEXT;
