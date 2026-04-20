-- ============================================
-- CDS Space: Testimonials Table
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Create the testimonials table
CREATE TABLE IF NOT EXISTS public.testimonials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  review TEXT NOT NULL,
  picture_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Enable Row Level Security
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

-- 3. Allow public read access (for the website frontend)
CREATE POLICY "Allow public read access on testimonials"
  ON public.testimonials
  FOR SELECT
  USING (true);

-- 4. Allow authenticated users full access (for admin)
CREATE POLICY "Allow authenticated full access on testimonials"
  ON public.testimonials
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 5. Allow service_role full access (for API routes)
CREATE POLICY "Allow service_role full access on testimonials"
  ON public.testimonials
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. Create storage bucket for testimonial pictures (run only if bucket doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('testimonials', 'testimonials', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Allow public read on testimonials bucket
CREATE POLICY "Allow public read on testimonials bucket"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'testimonials');

-- 8. Allow authenticated upload to testimonials bucket
CREATE POLICY "Allow authenticated upload to testimonials bucket"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'testimonials');

-- 9. Allow authenticated delete from testimonials bucket
CREATE POLICY "Allow authenticated delete from testimonials bucket"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'testimonials');

-- 10. Seed with existing testimonials (optional - remove if you want to start fresh)
INSERT INTO public.testimonials (name, review) VALUES
  ('metalmind', 'Their passion, creativity, and attention to detail are contagious - they''ve got this incredible ability to balance bold ideas with practical know how, resulting in branding that''s both beautiful and effective. (💙💛)'),
  ('Constance Asuquo', 'Beautiful work from CDS Space, very prompt delivery on unique designs. Highly recommended for all branding services.'),
  ('Iberedem Abiah', 'I''ve had the absolute pleasure of working with Chris John and the talented team at CDS Space on some amazing branding projects. What blows me away is how they can distill the heart and soul of a brand into a visual identity that genuinely connects with people.'),
  ('Mi Amor', 'I must say that I am very honored by how you effortlessly designed my food brand name and logo for me...Keep up the good work! I''m so satisfied with everything you have done for my project!✨🍱💚'),
  ('Rebecca Udom', 'Excellent service! Timely team, great attention to details and efficient communication. I like how simple yet knowledgeable the designs are.'),
  ('Evangelist Godspromise Anthony', 'Always delivering excellency.'),
  ('Auslean Assams', 'Literally love their services.. Kudos to Sir Chris'),
  ('Precious Oyise', 'CDS Space will always remain my only option because they give the best designs and they are fast in delivery their jobs. Kudos, CDS Space.');
