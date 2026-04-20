-- ============================================
-- CDS Space: Testimonials RLS Fix
-- Run this in Supabase SQL Editor
-- ============================================
-- The original supabase-testimonials.sql policy restricted
-- writes to auth.role() = 'authenticated'. The admin panel uses
-- a custom cookie login (not Supabase auth) so the client runs
-- as the anon role and every update/insert/delete gets silently
-- blocked by RLS.
--
-- This aligns the testimonials table with the permissive RLS
-- pattern already used by open_roles, role_applications,
-- clients, faqs, etc. in this project.
-- ============================================

-- Drop the role-restricted policies
DROP POLICY IF EXISTS "Allow authenticated full access on testimonials" ON public.testimonials;
DROP POLICY IF EXISTS "Allow service_role full access on testimonials" ON public.testimonials;
DROP POLICY IF EXISTS "Allow public read access on testimonials" ON public.testimonials;

-- Add a single permissive policy matching the rest of the project
CREATE POLICY "allow_all_testimonials"
  ON public.testimonials
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ---- Storage policies for the testimonials bucket ----
-- Admin uploads/removes via the anon client too, so UPDATE
-- and DELETE on storage.objects need to be open for this bucket.
DROP POLICY IF EXISTS "Allow authenticated upload to testimonials bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete from testimonials bucket" ON storage.objects;

CREATE POLICY "testimonials_bucket_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'testimonials');

CREATE POLICY "testimonials_bucket_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'testimonials')
  WITH CHECK (bucket_id = 'testimonials');

CREATE POLICY "testimonials_bucket_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'testimonials');
