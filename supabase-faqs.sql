-- ============================================
-- CDS Space: FAQs Table
-- Run this in your Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS public.faqs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on faqs" ON public.faqs;
CREATE POLICY "Allow public read on faqs"
  ON public.faqs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated write on faqs" ON public.faqs;
CREATE POLICY "Allow authenticated write on faqs"
  ON public.faqs FOR ALL USING (true) WITH CHECK (true);

-- Seed with existing FAQs
INSERT INTO public.faqs (question, answer, sort_order) VALUES
  ('How quickly can we expect results when working with CDS Space?', 'We prioritize both speed and strategy. Our agile workflow is designed to identify "quick wins" for your brand while we build out long-term solutions.', 1),
  ('What does your delivery process look like?', 'Our process is transparent and iterative. From discovery and moodboarding to final implementation, we keep you in the loop with weekly check-ins and shared progress dashboards.', 2),
  ('What are CDS Space''s core service specialties?', 'We specialize in high-end brand identity, strategic design systems, and custom digital product development. We bridge the gap between aesthetics and business performance.', 3),
  ('Do you have experience working within my specific industry?', 'We have collaborated with visionaries in FinTech, Web3, Hospitality, and Corporate AI. Our methodology is industry-agnostic, focusing on the core psychology of your specific audience.', 4),
  ('Can you handle our specific creative and branding needs?', 'Absolutely. Whether you need a ground-up rebrand or specific creative support for an upcoming launch, our team scales to meet the complexity of your requirements.', 5);
